import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Reflector } from '@nestjs/core';
import { MetadataScanner, DiscoveryService } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

describe.skip('Auth Guards (e2e)', () => {
  let app: INestApplication;
  let reflector: Reflector;
  let discoveryService: DiscoveryService;
  let metadataScanner: MetadataScanner;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    reflector = app.get(Reflector);
    discoveryService = app.get(DiscoveryService);
    metadataScanner = app.get(MetadataScanner);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 401 for all non-public routes without Auth header', async () => {
    const controllers = discoveryService.getControllers();

    for (const wrapper of controllers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) {
        continue;
      }

      const isClassPublic = reflector.get<boolean>('isPublic', metatype);
      const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype);
      if (controllerPath === undefined) {
        continue;
      }

      const prototype = Object.getPrototypeOf(instance);
      const methods = metadataScanner.scanFromPrototype(instance, prototype, (name) => name);

      for (const methodName of methods) {
        const methodRef = prototype[methodName];
        const isMethodPublic = reflector.get<boolean>('isPublic', methodRef);
        const isPublic = isClassPublic || isMethodPublic;

        if (isPublic) {
          continue;
        }

        const methodPath = Reflect.getMetadata(PATH_METADATA, methodRef);
        const requestMethodCode = Reflect.getMetadata(METHOD_METADATA, methodRef);
        if (methodPath === undefined || requestMethodCode === undefined) {
          continue;
        }

        const cleanControllerPath = typeof controllerPath === 'string'
          ? controllerPath
          : Array.isArray(controllerPath) ? controllerPath[0] : '';

        const cleanMethodPath = typeof methodPath === 'string'
          ? methodPath
          : Array.isArray(methodPath) ? methodPath[0] : '';

        let fullPath = '/api';
        if (cleanControllerPath) {
          fullPath += '/' + cleanControllerPath.replace(/^\/|\/$/g, '');
        }
        if (cleanMethodPath) {
          fullPath += '/' + cleanMethodPath.replace(/^\/|\/$/g, '');
        }
        fullPath = fullPath.replace(/\/+/g, '/');

        const testPath = fullPath.replace(/:[A-Za-z0-9_]+/g, '123');

        let httpMethod = 'GET';
        switch (requestMethodCode) {
          case RequestMethod.GET:
            httpMethod = 'GET';
            break;
          case RequestMethod.POST:
            httpMethod = 'POST';
            break;
          case RequestMethod.PUT:
            httpMethod = 'PUT';
            break;
          case RequestMethod.DELETE:
            httpMethod = 'DELETE';
            break;
          case RequestMethod.PATCH:
            httpMethod = 'PATCH';
            break;
          case RequestMethod.OPTIONS:
            httpMethod = 'OPTIONS';
            break;
          case RequestMethod.HEAD:
            httpMethod = 'HEAD';
            break;
        }

        const response = await request(app.getHttpServer())[httpMethod.toLowerCase()](testPath);
        expect(response.status).toBe(401);
      }
    }
  });
});

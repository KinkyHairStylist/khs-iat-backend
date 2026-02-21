import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
    async uploadBuffer(file: Express.Multer.File): Promise<string> {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
            { folder: 'KHS/ChatImages' },
            (error, result) => {
                if (error) return reject(error);
                if (!result || !result.secure_url) {
                return reject(new Error('Failed to upload image to Cloudinary'));
                }
                resolve(result.secure_url);
            },
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
        });
    }


    async uploadBase64(base64: string): Promise<string> {
        const normalizedPayload = this.normalizeBase64Payload(base64);

        try {
            const result = await cloudinary.uploader.upload(normalizedPayload, {
                folder: 'KHS/ChatImages',
            });

            if (!result?.secure_url) {
                throw new InternalServerErrorException('Cloudinary did not return an image URL');
            }

            return result.secure_url;
        } catch (error) {
            throw new InternalServerErrorException('Failed to upload image to Cloudinary');
        }
    }

    private normalizeBase64Payload(payload: string): string {
        const trimmed = payload?.trim();

        if (!trimmed) {
            throw new BadRequestException('Image payload is empty');
        }

        if (trimmed.startsWith('data:image/')) {
            return trimmed;
        }

        const mimeType = this.detectMimeType(trimmed);
        return `data:${mimeType};base64,${trimmed}`;
    }

    private detectMimeType(base64: string): string {
        if (base64.startsWith('/9j/')) return 'image/jpeg';
        if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
        if (base64.startsWith('R0lGOD')) return 'image/gif';
        if (base64.startsWith('UklGR')) return 'image/webp';

        return 'image/jpeg';
    }
}
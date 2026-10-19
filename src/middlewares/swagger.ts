import { Router, Request, Response, NextFunction } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "../docs";
import { ENABLE_API_DOCS } from "../config/env";

const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: "KHS Customer API Docs",
  customCss: `
    .swagger-ui .topbar { background-color: #0f172a; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
    .swagger-ui .info .title { color: #16a34a; }
  `,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: ENABLE_API_DOCS,
    // Sessions are httpOnly cookies, and every write needs the CSRF header
    // (see middlewares/csrfGuard.ts). Log in via POST /auth/login first.
    requestInterceptor: (req: { headers: Record<string, string>; credentials?: string }) => {
      req.headers["X-Requested-With"] = "khs-customer";
      req.credentials = "include";
      return req;
    },
  },
};

// Gated by ENABLE_API_DOCS (env var), not NODE_ENV — lets docs (and "Try it
// out") stay reachable in production when that's wanted, without a redeploy
// to flip it: just change the env var.
function docsGuard(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!ENABLE_API_DOCS) {
    res.status(404).json({ success: false, code: "NOT_FOUND", message: "Not found" });
    return;
  }
  next();
}

export function createDocsRouter(): Router {
  const router = Router();

  router.use(docsGuard);

  // Raw OpenAPI JSON — useful for Postman import and code generators
  router.get("/spec.json", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.json(openApiSpec);
  });

  // Swagger UI
  router.use("/", swaggerUi.serve);
  router.get("/", swaggerUi.setup(openApiSpec, swaggerUiOptions));

  return router;
}

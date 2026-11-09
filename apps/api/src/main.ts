import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie parsing (session auth)
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS — allow frontend to send cookies
  const allowedOrigins = (
    process.env.NEXT_ALLOWED_ORIGINS ?? 'http://localhost:4000'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });

  /*
   * Trust proxy — CRITIQUE pour IIS/ARR.
   * Indique à Express qu'il y a exactement 1 niveau de proxy devant lui
   * (IIS). Sans ce réglage :
   *  - req.ip retourne toujours 127.0.0.1 (IP du proxy IIS local)
   *  - Les cookies avec secure:true ne fonctionnent pas (le backend pense
   *    être en HTTP alors qu'IIS a peut-être terminé le TLS)
   *  - Les headers X-Forwarded-For/Proto/Host injectés par IIS sont ignorés
   * Avec ce réglage :
   *  - req.ip retourne l'IP réelle du client (depuis X-Forwarded-For)
   *  - ActivityLog trace les vraies IPs
   *  - Futur HTTPS : req.secure sera true si X-Forwarded-Proto: https
   *
   * Doit être placé AVANT app.listen().
   */
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  expressApp.set('trust proxy', 1);

  const port = Number(process.env.PORT ?? 4000);

  /*
   * Binding sur 127.0.0.1 uniquement — SÉCURITÉ.
   * Le port 4000 ne doit pas être accessible depuis le LAN.
   * Tout le trafic légitime passe par IIS (port 80) qui proxyifie vers
   * localhost:4000. Si IIS n'est pas le seul point d'entrée, des
   * règles de pare-feu Windows doivent bloquer le port 4000 en entrée.
   */
  await app.listen(port, '127.0.0.1');
  console.log(`[backend] NestJS running on http://127.0.0.1:${port}`);
}
void bootstrap();

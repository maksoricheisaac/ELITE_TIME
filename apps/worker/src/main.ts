import 'dotenv/config';
import 'reflect-metadata';
import { config as loadRootEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { validateWorkerEnv } from '@elitetime/config';
import { WorkerModule } from './worker.module';

// Développement : .env à la racine du monorepo en complément du .env local
loadRootEnv({ path: '../../.env', quiet: true });

async function bootstrap() {
  // Fail-fast : variables manquantes/invalides => arrêt (sans afficher les valeurs)
  validateWorkerEnv();

  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // SIGTERM/SIGINT : arrêt propre (jobs en cours terminés)
  new Logger('Worker').log('Worker démarré');
}

void bootstrap();

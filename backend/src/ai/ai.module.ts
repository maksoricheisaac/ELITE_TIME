import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { OllamaService } from './ollama.service.js';
import { ToolOrchestratorService } from './orchestrator/tool-orchestrator.service.js';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service.js';
import { ToolResultCache } from './cache/tool-result.cache.js';
import { AiMetricsService } from './metrics/ai-metrics.service.js';
import { AiRequestQueue } from './queue/ai-request.queue.js';
import { GetMyHoursTool } from './tools/get-my-hours.tool.js';
import { GetAbsentTodayTool } from './tools/get-absent-today.tool.js';
import { GetLateEmployeesTool } from './tools/get-late-employees.tool.js';
import { GetLeaveRequestsTool } from './tools/get-leave-requests.tool.js';
import { GetTeamAttendanceTool } from './tools/get-team-attendance.tool.js';
import { GetDepartmentStatisticsTool } from './tools/get-department-statistics.tool.js';
import { GetMyLeavesSummaryTool } from './tools/get-my-leaves-summary.tool.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AiController],
  providers: [
    // Services infrastructure
    AiService,
    OllamaService,
    CircuitBreakerService,
    ToolResultCache,
    AiMetricsService,
    AiRequestQueue,
    // Orchestration
    ToolOrchestratorService,
    // Outils métier
    GetMyHoursTool,
    GetAbsentTodayTool,
    GetLateEmployeesTool,
    GetLeaveRequestsTool,
    GetTeamAttendanceTool,
    GetDepartmentStatisticsTool,
    GetMyLeavesSummaryTool,
  ],
})
export class AiModule {}

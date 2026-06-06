"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var scheduled_emails_1 = require("../src/lib/scheduled-emails");
var prisma_1 = require("../src/lib/prisma");
function testWeeklyEmailTrigger() {
    return __awaiter(this, void 0, void 0, function () {
        var job, admin, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("--- Test Manual Weekly Email Trigger ---");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 12, 13, 15]);
                    return [4 /*yield*/, prisma_1.default.scheduledEmailJob.findFirst({
                            where: { type: "WEEKLY_REPORT" },
                            include: { recipients: true }
                        })];
                case 2:
                    job = _a.sent();
                    if (!!job) return [3 /*break*/, 4];
                    console.log("Job hebdomadaire non trouvé, création temporaire...");
                    return [4 /*yield*/, prisma_1.default.scheduledEmailJob.create({
                            data: {
                                type: "WEEKLY_REPORT",
                                enabled: true,
                                hour: 8,
                                minute: 0,
                                weekday: new Date().getDay(), // Aujourd'hui pour le test
                                includePdf: true,
                                includeExcel: true
                            },
                            include: { recipients: true }
                        })];
                case 3:
                    job = _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // S'assurer qu'il est activé et pour aujourd'hui pour le test
                return [4 /*yield*/, prisma_1.default.scheduledEmailJob.update({
                        where: { id: job.id },
                        data: {
                            enabled: true,
                            weekday: new Date().getDay()
                        }
                    })];
                case 5:
                    // S'assurer qu'il est activé et pour aujourd'hui pour le test
                    _a.sent();
                    _a.label = 6;
                case 6:
                    console.log("Found/Created job: ".concat(job.type, " (ID: ").concat(job.id, ")"));
                    if (!(job.recipients.length === 0)) return [3 /*break*/, 10];
                    console.log("Ajout d'un destinataire par défaut (premier admin trouvé)...");
                    return [4 /*yield*/, prisma_1.default.user.findFirst({ where: { role: "admin" } })];
                case 7:
                    admin = _a.sent();
                    if (!admin) return [3 /*break*/, 9];
                    return [4 /*yield*/, prisma_1.default.scheduledEmailJobRecipient.create({
                            data: { jobId: job.id, userId: admin.id }
                        })];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 10];
                case 9:
                    console.error("❌ Aucun admin trouvé pour servir de destinataire.");
                    return [2 /*return*/];
                case 10:
                    // 3. Déclencher le job
                    console.log("\n\uD83D\uDE80 D\u00E9clenchement du job hebdomadaire ".concat(job.id, "..."));
                    return [4 /*yield*/, (0, scheduled_emails_1.runScheduledEmailJob)(job.id)];
                case 11:
                    _a.sent();
                    console.log("\n✅ Test hebdomadaire terminé.");
                    return [3 /*break*/, 15];
                case 12:
                    error_1 = _a.sent();
                    console.error("\n❌ Erreur :");
                    console.error(error_1);
                    return [3 /*break*/, 15];
                case 13: return [4 /*yield*/, prisma_1.default.$disconnect()];
                case 14:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 15: return [2 /*return*/];
            }
        });
    });
}
testWeeklyEmailTrigger();

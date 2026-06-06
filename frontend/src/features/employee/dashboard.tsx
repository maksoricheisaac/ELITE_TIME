"use client";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useNotification } from "@/contexts/notification-context";
import { formatMinutesHuman } from "@/lib/time-format";
import { useRealtime } from "@/contexts/realtime-context";
import { Coffee, AlertTriangle } from "lucide-react";
import type { SafeUser } from "@/lib/session";
import type { Pointage, Break as BreakModel } from "@/types/models";
import { useRouter } from "next/navigation";
import { startEmployeePointage, endEmployeePointage, updateEmployeeLateReason, updateEmployeeEarlyExitReason } from "@/actions/employee/pointages";
import { startEmployeeBreak, endEmployeeBreak } from "@/actions/employee/breaks";
import { formatDateFR } from "@/lib/date-utils";


type Break = Pick<BreakModel, "startTime" | "endTime" | "duration">;


interface WeekStats {
	hours: number;
	lates: number;
	overtime: number;
}


interface EmployeeDashboardClientProps {
	user: SafeUser;
	todayPointage: Pointage | null;
	weekStats: WeekStats;
	workStartTime: string;
	workEndTime: string;
	initialBreaks: Break[];
	isOnLeaveToday?: boolean;
	incompletePointages?: Pointage[];
}


export default function EmployeeDashboardClient({
	user,
	todayPointage,
	weekStats,
	workStartTime,
	workEndTime,
	initialBreaks,
	isOnLeaveToday = false,
	incompletePointages = [],
}: EmployeeDashboardClientProps) {
	const { showSuccess, showInfo, showError, showWarning } = useNotification();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [currentTime, setCurrentTime] = useState(new Date());
	const [hasMounted, setHasMounted] = useState(false);
	const [breaks, setBreaks] = useState<Break[]>(initialBreaks ?? []);
	const [isOnBreak, setIsOnBreak] = useState(
		() => (initialBreaks ?? []).some((b) => !b.endTime),
	);
	const { emitLateAlert } = useRealtime();


	const isActive = todayPointage?.isActive ?? false;
	// Session started today but isActive was turned off without an exit being recorded
	// (auto-close, admin action, etc.) — employee is still considered "at work".
	const hasIncompleteSession = Boolean(todayPointage && !isActive && !todayPointage.exitTime);
	const isPointedByAdmin = todayPointage?.pointedBy === "admin" || todayPointage?.pointedBy === "manager";



	useEffect(() => {
	const timer = setInterval(() => setCurrentTime(new Date()), 1000);
	return () => clearInterval(timer);
	}, []);



	useEffect(() => {
		// Use a timer to set hasMounted so the setState call is inside an
		// external-system callback (timer callback), not synchronously in the body.
		const id = setTimeout(() => setHasMounted(true), 0);
		return () => clearTimeout(id);
	}, []);



	const handlePointageEntry = () => {
		startTransition(async () => {
			try {
				const pointage = await startEmployeePointage(user.id);
				if (!pointage) {
					showError("Échec de l'enregistrement du pointage d'entrée.");
					return;
				}

				showSuccess(
					"Pointage d'entrée enregistré à " + currentTime.toLocaleTimeString("fr-FR"),
				);


				let delayMinutes: number | null = null;
				let delayLabel: string | null = null;

				// Calcul de l'écart par rapport à l'heure de début prévue

				if (workStartTime && pointage.entryTime) {

					const [startH, startM] = workStartTime.split(":").map((v) => Number(v) || 0);

					const [entryH, entryM] = pointage.entryTime

						.split(":")

						.map((v: string) => Number(v) || 0);

					const scheduledMinutes = startH * 60 + startM;

					const entryMinutes = entryH * 60 + entryM;

					const diffMinutes = entryMinutes - scheduledMinutes; // > 0 : retard, < 0 : avance



					if (diffMinutes > 0) {

						delayMinutes = diffMinutes;

						delayLabel = formatMinutesHuman(diffMinutes);

					} else if (diffMinutes < 0) {

						const advanceMinutes = Math.abs(diffMinutes);

						const advanceLabel = formatMinutesHuman(advanceMinutes);

						showInfo(

							`Vous êtes en avance de ${advanceLabel} sur l'heure prévue (${workStartTime}).`,

						);

					}

				}



				// Si le pointage créé est en retard, on ouvre immédiatement la modale de motif

				// et on émet une alerte temps réel enrichie.

				if (pointage.status === "late") {

					setShowAlertCard(true);

					setShowLateReasonForm(true);

					setLateReason(pointage.lateReason ?? "");



					const displayName =

						`${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() || user.username;



					emitLateAlert({

						userId: user.id,

						userName: displayName,

						timestamp: new Date().toISOString(),

						delayMinutes,

						delayLabel,

						workStartTime: workStartTime || null,

						entryTime: pointage.entryTime ?? null,

					});

				}



				router.refresh();

			} catch (e) {

				console.error(e);

				const message =

					e instanceof Error && e.message

						? e.message

						: "Une erreur est survenue lors du pointage d'entrée.";

				showError(message);

			}

		});

	};



	const handlePointageExit = () => {

		startTransition(async () => {

			try {

				const result = await endEmployeePointage(user.id);

				if (!result) {

					showError("Échec de l'enregistrement du pointage de sortie.");

					return;

				}

				const { pointage, isEarlyExit, earlyExitMinutes: exitMinutes } = result;

				showSuccess(

					"Pointage de sortie enregistré à " + currentTime.toLocaleTimeString("fr-FR"),

				);

				// Si sortie anticipée, afficher la modale pour la raison
				if (isEarlyExit && exitMinutes && exitMinutes > 5) {
					setLastExitPointageId(pointage.id);
					setEarlyExitMinutes(exitMinutes);
					setEarlyExitReason("");
					setShowEarlyExitDialog(true);
				} else {
					// Notification détaillée départ en avance / en retard par rapport à l'heure de fin prévue
					if (workEndTime) {
						const [endH, endM] = workEndTime.split(":").map((v) => Number(v) || 0);
						const scheduled = new Date(currentTime);
						scheduled.setHours(endH, endM, 0, 0);
						const diffMs = currentTime.getTime() - scheduled.getTime();
						const totalSeconds = Math.abs(Math.round(diffMs / 1000));
						// On ignore les écarts inférieurs à 30s pour éviter les faux positifs
						if (diffMs !== 0 && totalSeconds >= 30) {
							const minutes = Math.floor(totalSeconds / 60);
							const detail = formatMinutesHuman(minutes);
							const isAfter = diffMs > 0;
							const message = isAfter
								? `Vous avez dépassé l'heure de fin prévue de ${detail} (fin prévue: ${workEndTime}).`
								: `Vous avez quitté ${detail} avant l'heure de fin prévue (${workEndTime}).`;
							if (isAfter) {
								showInfo(message);
							} else {
								showWarning(message);
							}
						}
					}
				}

				router.refresh();

			} catch (e) {

				console.error(e);

				showError("Une erreur est survenue lors du pointage de sortie.");

			}

		});

	};

	const handleSaveEarlyExitReason = async () => {
		if (!lastExitPointageId) return;

		try {
			setIsSavingEarlyExitReason(true);
			const updated = await updateEmployeeEarlyExitReason(user.id, lastExitPointageId, earlyExitReason.trim());
			if (!updated) {
				showError("Impossible d'enregistrer le motif de sortie anticipée.");
				return;
			}
			showSuccess("Motif de sortie anticipée enregistré.");
			setShowEarlyExitDialog(false);
			setLastExitPointageId(null);
			setEarlyExitMinutes(null);
		} catch (e) {
			console.error(e);
			showError("Une erreur est survenue lors de l'enregistrement du motif.");
		} finally {
			setIsSavingEarlyExitReason(false);
		}
	};



	const handleBreakStart = () => {

	const hour = currentTime.getHours();



	if (hour < 12 || hour >= 14) {

		showInfo("Les pauses ne peuvent être prises qu'entre 12h et 14h");

		return;

	}



	startTransition(async () => {

		try {

			const created = await startEmployeeBreak(user.id);

			if (!created) {

				showError("Échec de l'enregistrement de la pause.");

				return;

			}

			setBreaks((prev) => [

				...prev,

				{

					startTime: created.startTime,

					endTime: created.endTime ?? null,

					duration: created.duration ?? null,

				},

			]);

			setIsOnBreak(true);

			showInfo("Pause démarrée à " + created.startTime);

		} catch (e) {

			console.error(e);

			showError("Une erreur est survenue lors du démarrage de la pause.");

		}

	});

	};



	const handleBreakEnd = () => {

		startTransition(async () => {

			try {

				const updated = await endEmployeeBreak(user.id);

				if (!updated) {

					showError("Aucune pause active à terminer.");

					return;

				}

				setBreaks((prev) => {

					if (prev.length === 0) return prev;



					const cloned = [...prev];

					const last = cloned[cloned.length - 1];

					cloned[cloned.length - 1] = {

						...last,

						endTime: updated.endTime,

						duration: updated.duration,

					};

					return cloned;

				});

				setIsOnBreak(false);

				if (updated.duration != null) {

					const durationLabel = formatMinutesHuman(updated.duration);

					showSuccess(`Pause terminée. Durée: ${durationLabel}`);

					const targetMinutes = 60;

					const delta = updated.duration - targetMinutes;

					if (delta > 0) {

						const deltaLabel = formatMinutesHuman(delta);

						showWarning(

							`Votre pause a dépassé 1 heure de ${deltaLabel}.`,

						);

					} else if (delta < 0) {

						const absDeltaLabel = formatMinutesHuman(Math.abs(delta));

						showInfo(

							`Votre pause a duré ${durationLabel} (soit ${absDeltaLabel} de moins que 1 heure).`,

						);

					}

				}

			} catch (e) {

				console.error(e);

				showError("Une erreur est survenue lors de la fin de la pause.");

			}

		});

	};



	const { lates: weekLates, overtime: weekOvertime } = weekStats;

	const [showAlertCard, setShowAlertCard] = useState(

		todayPointage?.status === "late" && !todayPointage?.lateReason,

	);

	const [lateReason, setLateReason] = useState(todayPointage?.lateReason ?? "");

	const [isSavingLateReason, setIsSavingLateReason] = useState(false);

	const [showLateReasonForm, setShowLateReasonForm] = useState(

		todayPointage?.status === "late" && !todayPointage?.lateReason,

	);

	// États pour la gestion des sorties anticipées
	const [showEarlyExitDialog, setShowEarlyExitDialog] = useState(false);
	const [earlyExitReason, setEarlyExitReason] = useState("");
	const [isSavingEarlyExitReason, setIsSavingEarlyExitReason] = useState(false);
	const [lastExitPointageId, setLastExitPointageId] = useState<string | null>(null);
	const [earlyExitMinutes, setEarlyExitMinutes] = useState<number | null>(null);



	const today = new Date();

	const todayISO = today.toISOString().split("T")[0];



	let todayLateDelayLabel: string | null = null;

	if (todayPointage?.status === "late" && todayPointage.entryTime && workStartTime) {

		const [startH, startM] = workStartTime.split(":").map((v) => Number(v) || 0);

		const [entryH, entryM] = todayPointage.entryTime.split(":").map((v: string) => Number(v) || 0);

		const scheduledMinutes = startH * 60 + startM;

		const entryMinutes = entryH * 60 + entryM;

		const diffMinutes = entryMinutes - scheduledMinutes;

		if (diffMinutes > 0) {

			todayLateDelayLabel = formatMinutesHuman(diffMinutes);

		}

	}



	const computedWorkedHours = (() => {

	if (!todayPointage?.entryTime || !isActive || isOnBreak) return null;

	const startDate = new Date(`${todayISO}T${todayPointage.entryTime}`);

	const diffMs = currentTime.getTime() - startDate.getTime();

	if (diffMs <= 0) return null;

	const hours = Math.floor(diffMs / 3600000);

	return hours;

	})();



	type DayAction = {

	label: string;

	time: string;

	order: number;

	};



	const parseTimeToOrder = (time: string | null | undefined): number => {

	if (!time) return 0;

	const parts = time.split(":").map((part) => parseInt(part, 10));

	if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {

		return 0;

	}

	const [h, m, s] = parts;

	return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);

	};



	const dayActions: DayAction[] = [];



	if (todayPointage?.entryTime) {

	dayActions.push({

		label: "Pointage d'entrée",

		time: todayPointage.entryTime,

		order: parseTimeToOrder(todayPointage.entryTime),

	});

	}



	if (todayPointage?.exitTime) {

	dayActions.push({

		label: "Pointage de sortie",

		time: todayPointage.exitTime,

		order: parseTimeToOrder(todayPointage.exitTime),

	});

	}



	breaks.forEach((breakItem) => {

	dayActions.push({

		label: "Démarrage de pause",

		time: breakItem.startTime,

		order: parseTimeToOrder(breakItem.startTime),

	});



	if (breakItem.endTime) {

		dayActions.push({

		label: "Fin de pause",

		time: breakItem.endTime,

		order: parseTimeToOrder(breakItem.endTime),

		});

	}

	});



	dayActions.sort((a, b) => a.order - b.order);



	const isWorking = isActive || hasIncompleteSession;

	const currentStatusLabel = isOnLeaveToday

	? "En congé"

	: isOnBreak

	? "En pause"

	: isWorking

	? "En activité"

	: "Hors service";
	const currentStatusDescription = isOnLeaveToday
	? "Vous êtes en congé aujourd'hui. Le pointage est désactivé."
	: isWorking && isOnBreak
	? "Vous êtes actuellement en pause."
	: isWorking
	? "Votre journée de travail est en cours."
	: todayPointage?.exitTime
	? "Votre session précédente est terminée. Vous pouvez pointer votre retour."
	: "Commencez votre journée en pointant votre arrivée.";

	const primaryCtaLabel = (() => {
		if (isOnLeaveToday) return "En congé aujourd'hui";
		if (!todayPointage) return "Pointer mon arrivée";
		if (isActive || hasIncompleteSession) return "Pointer ma sortie";
		// "Retour" only makes sense after a complete session (entry + exit).
		if (todayPointage.exitTime) return "Pointer mon retour";
		return "Pointer mon arrivée";
	})();

	const handlePrimaryCta = () => {
		if (isOnLeaveToday) return;
		if (isActive || hasIncompleteSession) {
			handlePointageExit();
		} else {
			handlePointageEntry();
		}
	};

	const primaryCtaDisabled = isPending || isOnLeaveToday;

	const handleSaveLateReason = async () => {

		try {

			setIsSavingLateReason(true);

			const updated = await updateEmployeeLateReason(user.id, lateReason);

			if (!updated) {

				showError("Impossible d'enregistrer le motif de retard.");

				return;

			}

			showSuccess("Motif de retard enregistré.");

			setShowLateReasonForm(false);

			setShowAlertCard(false);

			// on laisse router.refresh géré par les prochaines actions de pointage si besoin

		} catch (e) {

			console.error(e);

			showError("Une erreur est survenue lors de l'enregistrement du motif.");

		} finally {

			setIsSavingLateReason(false);

		}

	};



	return (

	<div className="space-y-4 sm:space-y-6 lg:space-y-8">

		<div>

		<h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">

			Bonjour, <span className="text-primary">{user.firstname || ""}</span>

		</h1>

		<p className="text-muted-foreground">

			{formatDateFR(currentTime)}

		</p>

		</div>



		<Dialog open={showAlertCard} onOpenChange={setShowAlertCard}>

			<DialogContent>

				<DialogHeader>

					<DialogTitle>Retard détecté</DialogTitle>

					<DialogDescription>

						{todayPointage?.status === "late" || showLateReasonForm ? (

							<>

								Vous avez pointé en retard aujourd&apos;hui

								{todayLateDelayLabel ? ` de ${todayLateDelayLabel}` : ""}.

							</>

						) : (

							"Un retard a été enregistré sur votre journée."

						)}

					</DialogDescription>

				</DialogHeader>

				<div className="space-y-2 text-sm">

					{weekLates > 0 && (

						<p>

							{weekLates === 1

								? "1 retard enregistré cette semaine."

								: `${weekLates} retards enregistrés cette semaine.`}

						</p>

					)}

					{weekOvertime > 0 && (

						<p>

							{weekOvertime}h d&apos;heures supplémentaires cette semaine.

						</p>

					)}

				</div>

				{(todayPointage?.status === "late" || showLateReasonForm || todayPointage?.lateReason) && (

					<div className="mt-4 space-y-2">

						{todayPointage?.lateReason && !showLateReasonForm && (

							<p className="text-xs text-muted-foreground">

								Motif renseigné : {todayPointage.lateReason}

							</p>

						)}

						{!todayPointage?.lateReason && !showLateReasonForm && (

							<div className="flex flex-wrap items-center gap-2">

								<span className="text-xs text-muted-foreground">

									Souhaitez-vous ajouter un motif pour ce retard ?

								</span>

								<Button

										type="button"

										variant="default"

										size="sm"

										className="cursor-pointer"

										onClick={() => setShowLateReasonForm(true)}

									>

										Ajouter un motif

									</Button>

							</div>

						)}

						{showLateReasonForm && (

							<div className="space-y-2">

								<Textarea

										value={lateReason}

										onChange={(e) => setLateReason(e.target.value)}

										rows={3}

										placeholder="Ex : Problème de transport, rendez-vous médical..."

									/>

								<div className="flex flex-wrap gap-2 justify-end">

									<Button

											type="button"

											size="sm"

											className="cursor-pointer"

											disabled={isSavingLateReason}

											onClick={handleSaveLateReason}

										>

											{isSavingLateReason ? "Enregistrement..." : "Enregistrer le motif"}

										</Button>

										<Button

											type="button"

											variant="destructive"

											size="sm"

											className="cursor-pointer"

											onClick={() => setShowLateReasonForm(false)}

										>

											Plus tard

										</Button>

									</div>

							</div>

						)}

					</div>

				)}

			</DialogContent>

		</Dialog>

		{/* Dialog pour la sortie anticipée */}
		<Dialog open={showEarlyExitDialog} onOpenChange={setShowEarlyExitDialog}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Sortie anticipée détectée</DialogTitle>
					<DialogDescription>
						Vous avez pointé votre sortie 
						{earlyExitMinutes ? `${formatMinutesHuman(earlyExitMinutes)} avant l'heure prévue (${workEndTime})` : "avant l'heure prévue"}.
						<br />
						Veuillez indiquer la raison de ce départ anticipé.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4 space-y-4">
					<div className="space-y-2">
						<Textarea
							value={earlyExitReason}
							onChange={(e) => setEarlyExitReason(e.target.value)}
							rows={3}
							placeholder="Ex : Rendez-vous médical, urgence familiale, congé partiel..."
						/>
					</div>

					<div className="flex flex-wrap gap-2 justify-end">
						<Button
							type="button"
							size="sm"
							className="cursor-pointer"
							disabled={isSavingEarlyExitReason}
							onClick={handleSaveEarlyExitReason}
						>
							{isSavingEarlyExitReason ? "Enregistrement..." : "Enregistrer le motif"}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="cursor-pointer"
							onClick={() => {
								setShowEarlyExitDialog(false);
								setLastExitPointageId(null);
								setEarlyExitMinutes(null);
							}}
							disabled={isSavingEarlyExitReason}
						>
							Plus tard
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>

		<Card className="border border-primary/30 bg-card rounded-xl shadow-md">

		<CardHeader>

			<CardTitle className="flex items-center justify-between gap-2">

			<span>Pointage du jour</span>

			<span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">

				<span

				className={`h-2.5 w-2.5 rounded-full ${

					isOnLeaveToday

					? "bg-muted"

					: isOnBreak

					? "bg-warning animate-pulse"

					: isWorking

					? "bg-success animate-pulse"

					: "bg-muted"

				}`}

				/>

				<span>{currentStatusLabel}</span>

			</span>

			</CardTitle>

			<CardDescription>{currentStatusDescription}</CardDescription>

		</CardHeader>

			<CardContent className="flex flex-col gap-4 sm:gap-6 md:flex-row md:items-center md:justify-between">

				<div className="space-y-3">

				{incompletePointages.length > 0 && (
					<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg p-3 flex items-start gap-3 mb-2 animate-in fade-in slide-in-from-top-2 duration-500">
						<div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full shrink-0">
							<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
						</div>
						<div className="flex-1">
							<p className="text-xs font-bold text-red-900 dark:text-red-200 uppercase tracking-wider">
								Pointage(s) incomplet(s)
							</p>
							<p className="text-[11px] text-red-700 dark:text-red-400 mt-1 leading-relaxed">
								{incompletePointages.length === 1
									? `Vous n'avez pas pointé votre heure de départ le ${new Date(incompletePointages[0].date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.`
									: `Vous avez ${incompletePointages.length} jour(s) sans pointage de départ (dernier : ${new Date(incompletePointages[0].date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}).`}
								{" "}Veuillez contacter votre responsable pour corriger la situation.
							</p>
						</div>
					</div>
				)}

				{isActive && isPointedByAdmin && (
					<div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 flex items-start gap-3 mb-2 animate-in fade-in slide-in-from-top-2 duration-500">
						<div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full shrink-0">
							<Coffee className="h-4 w-4 text-amber-600 dark:text-amber-400" />
						</div>
						<div className="flex-1">
							<p className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">Pointage Administratif</p>
							<p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
								Votre entrée a été enregistrée par l&apos;administration. Vous pouvez continuer votre journée normalement (pause, sortie).
							</p>
						</div>
					</div>
				)}

				{todayPointage?.entryTime ? (

				<p className="text-sm text-muted-foreground">

				Arrivée : {todayPointage.entryTime}

				{computedWorkedHours !== null &&

					` • Temps travaillé estimé : ${computedWorkedHours}h`}

				</p>

			) : (

				<p className="text-sm text-muted-foreground">

				{isOnLeaveToday

					? "Vous êtes en congé aujourd'hui."

					: "Vous n'avez pas encore pointé aujourd'hui."}

					</p>

				)}

				<div className="space-y-2">

					<div className="flex items-center justify-between text-xs text-muted-foreground">

					<span>Objectif du jour</span>

					<span className="font-medium text-foreground">

						{workStartTime} → {workEndTime}

					</span>

					</div>

				</div>

				</div>

			<div className="flex flex-col items-stretch gap-2 md:w-56 lg:w-64">

			<Button

				onClick={handlePrimaryCta}

				disabled={primaryCtaDisabled}

				variant={(isActive || hasIncompleteSession) ? "destructive" : "default"}

				className="h-12 text-base font-semibold cursor-pointer"

			>

				{primaryCtaLabel}

			</Button>

			{isActive && !isOnLeaveToday && (
				isOnBreak ? (
					<Button
						onClick={handleBreakEnd}
						disabled={isPending}
						variant="outline"
						className="h-10 text-sm font-medium cursor-pointer"
					>
						<Coffee className="mr-2 h-4 w-4" />
						Terminer la pause
					</Button>
				) : (
					<Button
						onClick={handleBreakStart}
						disabled={isPending}
						variant="outline"
						className="h-10 text-sm font-medium cursor-pointer"
					>
						<Coffee className="mr-2 h-4 w-4" />
						Démarrer une pause
					</Button>
				)
			)}

			<p className="text-xs text-muted-foreground text-center">

				{hasMounted ? currentTime.toLocaleTimeString("fr-FR") : ""}

			</p>

			</div>

		</CardContent>

		</Card>



		

		<Card className="bg-card/80 shadow-sm">

			<CardHeader>

			<CardTitle>Statut Actuel</CardTitle>

			</CardHeader>

			<CardContent>

			<div className="flex items-center gap-4">

				<div

				className={`h-4 w-4 rounded-full ${

					isOnLeaveToday

					? "bg-muted"

					: isOnBreak

					? "bg-warning animate-pulse"

					: isWorking

					? "bg-success animate-pulse"

					: "bg-muted"

				}`}

				/>

				<div>

				<p className="font-semibold">

					{isOnLeaveToday

						? "En congé"

						: isOnBreak

						? "En pause"

						: isWorking

						? "En activité"

						: "Hors service"}

				</p>

				{todayPointage?.entryTime && (

					<p className="text-sm text-muted-foreground">

					Arrivée: {todayPointage.entryTime}

					{computedWorkedHours !== null &&

						` • Temps travaillé: ${computedWorkedHours}h`}

					</p>

				)}

				</div>

			</div>

			{dayActions.length > 0 && (

				<div className="mt-4 space-y-2">

				<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">

					Dernières actions

				</p>

				<ul className="space-y-1.5 text-xs">

					{dayActions.slice(-4).map((action: DayAction, index: number) => (

					<li

						key={`${action.time}-${index}`}

						className="flex items-center justify-between"

					>

						<span className="text-muted-foreground">{action.time}</span>

						<span className="font-medium text-foreground">{action.label}</span>

					</li>

					))}

				</ul>

				</div>

			)}

			</CardContent>

		</Card>



		

	</div>

	);

}


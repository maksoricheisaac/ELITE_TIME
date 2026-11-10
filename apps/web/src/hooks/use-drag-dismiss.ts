"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { animate, useMotionValue, useReducedMotion } from "framer-motion";

/**
 * Geste « glisser pour fermer » (feuille basse, tiroir latéral).
 * Principes (skill apple-design) :
 *  - Pointer Events + `setPointerCapture` : le suivi continue hors de l'élément ;
 *  - suivi 1:1 du doigt, en respectant le point d'appui (le décalage initial est conservé) ;
 *  - seuil d'hystérésis de 10 px avant de décider de la direction ;
 *  - résistance progressive (rubber-banding) dans le sens opposé à la fermeture ;
 *  - au relâchement : vitesse mesurée sur les derniers 100 ms, position finale PROJETÉE
 *    (décélération exponentielle), puis ressort critique (sans rebond) qui reprend la vitesse du doigt ;
 *  - le geste reste interruptible : une nouvelle prise stoppe l'animation en cours et repart de la
 *    position affichée (valeur vivante), jamais de la cible.
 * Les écritures se font directement sur le DOM (style.transform) : aucun re-render pendant le glisser.
 */

const DECELERATION = 0.998;
const HYSTERESIS = 10;

/** Où s'arrêterait l'élément si on le laissait glisser avec cette vitesse (px/s) */
const project = (velocity: number) => ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);

/** Plus on dépasse la borne, moins l'élément suit : il ralentit avant de s'arrêter */
const rubberband = (overshoot: number, dimension: number, c = 0.55) =>
  (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));

interface Options {
  /** Élément déplacé (la feuille) */
  targetRef: RefObject<HTMLElement | null>;
  /** `y` pour une feuille basse, `x` pour un tiroir latéral */
  axis: "x" | "y";
  /** Sens de fermeture : 1 = vers le bas / la droite, -1 = vers le haut / la gauche */
  direction: 1 | -1;
  onDismiss: () => void;
  enabled?: boolean;
  /**
   * `handle` : seule la poignée capte le geste (feuille basse, laisse le contenu défiler).
   * `surface` : tout l'élément, mais le geste ne démarre que si le mouvement est franchement dans l'axe
   * de fermeture (le défilement perpendiculaire reste au navigateur).
   */
  mode: "handle" | "surface";
  /** Types de pointeur autorisés (le tiroir mobile ignore la souris) */
  pointerTypes?: Array<"touch" | "pen" | "mouse">;
}

export function useDragDismiss({
  targetRef,
  axis,
  direction,
  onDismiss,
  enabled = true,
  mode,
  pointerTypes = ["touch", "pen", "mouse"],
}: Options) {
  const pointerKey = pointerTypes.join();
  const value = useMotionValue(0);
  const reduced = useReducedMotion();
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  const drag = useRef({
    active: false,
    started: false,
    id: -1,
    startMain: 0,
    startCross: 0,
    base: 0,
    size: 1,
    samples: [] as { t: number; p: number }[],
  });

  // Écrit la transformation sur le DOM à chaque changement de la valeur animée
  useEffect(() => {
    const unsubscribe = value.on("change", (v) => {
      const el = targetRef.current;
      if (!el) return;
      el.style.transform = v === 0 ? "" : axis === "y" ? `translate3d(0, ${v}px, 0)` : `translate3d(${v}px, 0, 0)`;
    });
    return () => {
      unsubscribe();
      value.stop();
    };
  }, [value, axis, targetRef]);

  const point = (e: ReactPointerEvent) => ({
    main: axis === "y" ? e.clientY : e.clientX,
    cross: axis === "y" ? e.clientX : e.clientY,
  });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !pointerTypes.includes(e.pointerType as "touch" | "pen" | "mouse")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const target = targetRef.current;
      if (!target) return;
      const { main, cross } = point(e);
      const d = drag.current;
      d.active = true;
      d.started = false;
      d.id = e.pointerId;
      d.startMain = main;
      d.startCross = cross;
      d.size = (axis === "y" ? target.offsetHeight : target.offsetWidth) || 1;
      d.samples = [{ t: performance.now(), p: main }];
      // Interruptibilité : on reprend depuis la position affichée (valeur vivante)
      value.stop();
      d.base = value.get();
      if (mode === "handle") {
        e.currentTarget.setPointerCapture(e.pointerId);
        d.started = true; // la poignée est un geste explicite : pas d'ambiguïté à lever
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, axis, mode, value, targetRef, pointerKey],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      const { main, cross } = point(e);
      const delta = main - d.startMain;

      if (!d.started) {
        const dMain = Math.abs(delta);
        const dCross = Math.abs(cross - d.startCross);
        if (dMain < HYSTERESIS && dCross < HYSTERESIS) return;
        // Intention : mouvement dans l'axe ET dans le sens de fermeture, sinon on abandonne le geste
        if (dMain > dCross && delta * direction > 0) {
          d.started = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          d.startMain = main - Math.sign(delta) * HYSTERESIS; // pas de saut au démarrage
        } else {
          d.active = false;
          return;
        }
      }

      const raw = main - d.startMain + d.base; // 1:1 avec le doigt, point d'appui conservé
      const toward = raw * direction; // > 0 : vers la fermeture
      value.set(toward >= 0 ? raw : -direction * rubberband(-toward, d.size));
      const now = performance.now();
      d.samples.push({ t: now, p: main });
      while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axis, direction, value],
  );

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      d.active = false;
      if (!d.started) return;
      d.started = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

      const first = d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const velocity = ((last.p - first.p) / dt) * 1000 * direction; // px/s, > 0 = vers la fermeture
      const current = value.get() * direction;
      const projected = current + project(velocity);
      // Décision par la vitesse ET la position projetée : un petit coup de pouce rapide ferme,
      // un lent retour en arrière annule ; une inversion nette (vitesse négative) annule toujours.
      const dismiss = !cancelled && velocity > -300 && (projected > d.size * 0.5 || velocity > 700);

      const target = dismiss ? d.size * direction : 0;
      animate(value, target, {
        type: "spring",
        bounce: 0, // amortissement critique : aucun rebond
        duration: reduced ? 0.01 : 0.35,
        velocity: velocity * direction, // reprise de la vitesse du doigt : pas de couture
        onComplete: () => {
          if (dismiss) onDismissRef.current();
        },
      });
    },
    [direction, value, reduced],
  );

  /** À appeler quand la feuille (re)monte : repart de la position de repos */
  const reset = useCallback(() => {
    value.stop();
    value.set(0);
  }, [value]);

  return {
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => finish(e, false),
      onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => finish(e, true),
    },
  };
}

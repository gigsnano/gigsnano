"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type ChartPhase,
  type ChartStatus,
  resolveRestingChartPhase,
} from "@/components/charts/hooks/chart-phase";

export interface UseChartPhaseOrchestratorOptions {
  chartStatus: ChartStatus;
  targetData: Record<string, unknown>[];
  skeletonData: Record<string, unknown>[];
  animationDuration: number;
  yDomainTweenDuration: number;
  /** Signature of motion URL state — replays clip reveal in Studio. */
  revealSignature?: string;
  /** Skip mount/signature enter reveal (static docs previews). */
  skipEnterReveal?: boolean;
}

function resolvePlotDataForPhase(
  chartPhase: ChartPhase,
  chartStatus: ChartStatus,
  skeletonData: Record<string, unknown>[],
  targetData: Record<string, unknown>[]
): Record<string, unknown>[] {
  switch (chartPhase) {
    case "loading":
      return chartStatus === "loading" ? skeletonData : targetData;
    case "exiting":
      return skeletonData;
    case "exitingReady":
    case "gridTweenLoading":
    case "gridTweenReady":
    case "revealing":
    case "ready":
      return targetData;
    default:
      return targetData;
  }
}

export function useChartPhaseOrchestrator({
  chartStatus,
  targetData,
  skeletonData,
  animationDuration,
  yDomainTweenDuration,
  revealSignature = "",
  skipEnterReveal = false,
}: UseChartPhaseOrchestratorOptions) {
  const [chartPhase, setChartPhase] = useState<ChartPhase>(() =>
    resolveRestingChartPhase(chartStatus)
  );
  const [revealEpoch, setRevealEpoch] = useState(0);
  const [concealEpoch, setConcealEpoch] = useState(0);
  const [isLoaded, setIsLoaded] = useState(() => chartStatus === "ready");
  const phaseRef = useRef(chartPhase);

  useLayoutEffect(() => {
    phaseRef.current = chartPhase;
  }, [chartPhase]);

  const plotData = resolvePlotDataForPhase(
    chartPhase,
    chartStatus,
    skeletonData,
    targetData
  );

  const [prevChartStatus, setPrevChartStatus] = useState(chartStatus);
  if (chartStatus !== prevChartStatus) {
    const prevStatus = prevChartStatus;
    setPrevChartStatus(chartStatus);

    if (chartStatus === "ready" && prevStatus === "loading") {
      setIsLoaded(false);
      if (animationDuration <= 0) {
        if (yDomainTweenDuration <= 0) {
          setChartPhase("revealing");
        } else {
          setChartPhase("gridTweenReady");
        }
      } else {
        setChartPhase("exiting");
      }
    } else if (chartStatus === "loading" && prevStatus === "ready") {
      setIsLoaded(false);
      if (animationDuration <= 0) {
        if (yDomainTweenDuration <= 0) {
          setChartPhase("loading");
        } else {
          setChartPhase("gridTweenLoading");
        }
      } else {
        setConcealEpoch((epoch) => epoch + 1);
        setChartPhase("exitingReady");
      }
    }
  }

  const enterRevealKey = `${revealSignature}:${animationDuration}`;
  const [prevEnterRevealKey, setPrevEnterRevealKey] = useState(enterRevealKey);
  if (
    !skipEnterReveal &&
    chartStatus === "ready" &&
    chartPhase === "ready" &&
    enterRevealKey !== prevEnterRevealKey
  ) {
    setPrevEnterRevealKey(enterRevealKey);
    setChartPhase("revealing");
    setIsLoaded(false);
  }

  const [prevChartPhase, setPrevChartPhase] = useState(chartPhase);
  if (chartPhase !== prevChartPhase) {
    setPrevChartPhase(chartPhase);
    if (chartPhase === "revealing") {
      setRevealEpoch((epoch) => epoch + 1);
      if (animationDuration <= 0) {
        setChartPhase("ready");
        setIsLoaded(true);
      }
    }
  }

  useEffect(() => {
    if (chartPhase !== "revealing" || animationDuration <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setChartPhase("ready");
      setIsLoaded(true);
    }, animationDuration);
    return () => window.clearTimeout(timer);
  }, [animationDuration, chartPhase, revealEpoch]);

  /** Loading pulse exit finished — tween grid to ready spacing next. */
  const notifyLoadingPulseComplete = () => {
    if (phaseRef.current !== "exiting") {
      return;
    }
    setChartPhase("gridTweenReady");
  };

  /** Ready series conceal finished — tween grid to loading spacing next. */
  const notifyRevealConcealComplete = () => {
    if (phaseRef.current !== "exitingReady") {
      return;
    }
    setChartPhase("gridTweenLoading");
  };

  /** Grid tween finished — enter the next resting phase. */
  const notifyYDomainTweenComplete = () => {
    if (phaseRef.current === "gridTweenLoading") {
      setChartPhase("loading");
      return;
    }
    if (phaseRef.current === "gridTweenReady") {
      setChartPhase("revealing");
    }
  };

  return {
    chartPhase,
    plotData,
    revealEpoch,
    concealEpoch,
    isLoaded,
    notifyLoadingPulseComplete,
    notifyRevealConcealComplete,
    notifyYDomainTweenComplete,
  };
}

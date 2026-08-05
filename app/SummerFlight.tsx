"use client";

import { useEffect, useState } from "react";

export function SummerFlight() {
  const [flight, setFlight] = useState(0);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let launchTimer: number | undefined;
    let finishTimer: number | undefined;

    const clearFlightClass = () => {
      document.documentElement.classList.remove("flight-live");
    };

    const launch = () => {
      if (document.hidden || motionPreference.matches) {
        schedule(30000);
        return;
      }

      setFlight((current) => current + 1);
      document.documentElement.classList.add("flight-live");
      window.clearTimeout(finishTimer);
      finishTimer = window.setTimeout(clearFlightClass, 7600);
      schedule(30000);
    };

    const schedule = (delay: number) => {
      window.clearTimeout(launchTimer);
      launchTimer = window.setTimeout(launch, delay);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(launchTimer);
        window.clearTimeout(finishTimer);
        clearFlightClass();
      } else if (!motionPreference.matches) {
        schedule(1100);
      }
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (event.matches) {
        window.clearTimeout(launchTimer);
        window.clearTimeout(finishTimer);
        clearFlightClass();
      } else if (!document.hidden) {
        schedule(1100);
      }
    };

    if (!motionPreference.matches) schedule(1100);
    document.addEventListener("visibilitychange", handleVisibility);
    motionPreference.addEventListener("change", handleMotionPreference);

    return () => {
      window.clearTimeout(launchTimer);
      window.clearTimeout(finishTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      motionPreference.removeEventListener("change", handleMotionPreference);
      clearFlightClass();
    };
  }, []);

  if (!flight) return null;

  return (
    <div key={flight} className="flight-layer" aria-hidden="true">
      <div className="flight-group">
        <div className="flight-trail">
          <i className="trail-star one">✦</i>
          <i className="trail-star two">·</i>
          <i className="trail-star three">✧</i>
        </div>
        <span className="flight-bubble bubble-one" />
        <span className="flight-bubble bubble-two" />
        <span className="flight-bubble bubble-three" />
        <img src="/assets/paper-flight.gif" alt="" />
      </div>
    </div>
  );
}

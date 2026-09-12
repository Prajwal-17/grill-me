import type { CSSProperties } from "react";

// Fixed, staggered particles keep the animation stable while the draft changes.
const EMBERS = [7, 18, 32, 45, 59, 72, 84, 94];

export function GrillHeat() {
  return (
    <span className="grill-heat" aria-hidden="true">
      <span className="grill-heat__orbit" />
      <span className="grill-heat__bed" />
      {EMBERS.map((position, index) => (
        <span
          key={position}
          className="grill-heat__ember"
          style={
            {
              "--ember-x": `${position}%`,
              "--ember-delay": `${index * -0.47}s`,
              "--ember-drift": `${index % 2 === 0 ? 12 : -8}px`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig, useReducedMotion } from "motion/react";

const InstantMotionContext = createContext(false);
export const interactionEase = [0.23, 1, 0.32, 1] as const;

/** CSS portals and Motion presence share the same input and accessibility policy. */
export function InteractionMotionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [keyboard, setKeyboard] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const onKey = () => {
      document.documentElement.dataset.input = "keyboard";
      setKeyboard(true);
    };
    const onPointer = () => {
      document.documentElement.dataset.input = "pointer";
      setKeyboard(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  const instant = keyboard || Boolean(reduced);
  return (
    <InstantMotionContext.Provider value={instant}>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: instant ? 0 : 0.16, ease: interactionEase }}
      >
        {children}
      </MotionConfig>
    </InstantMotionContext.Provider>
  );
}

export function useInstantMotion() {
  return useContext(InstantMotionContext);
}

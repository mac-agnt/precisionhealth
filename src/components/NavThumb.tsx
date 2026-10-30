import { useLayoutEffect, useRef } from "react";
import { css } from "../runtime/template";

type Props = {
  /** Static look of the pill (colour, radius, transition). */
  style: string;
  /** Changes whenever the tabs or the active tab change, so we re-measure. */
  tabsKey: string;
};

/* The sliding highlight under the active top-bar tab.
   It measures the real active button rather than assuming every tab is the
   same width, so it stays on its tab however many tabs there are and however
   long their labels get. Width and offset are written straight to the DOM:
   React never owns them, so nothing re-renders and there is no feedback loop. */
export default function NavThumb({ style, tabsKey }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const thumb = ref.current;
    const group = thumb?.parentElement;
    if (!thumb || !group) return;

    const place = () => {
      const btn = group.querySelector<HTMLElement>('[data-nav-active="1"]');
      if (!btn) {
        thumb.style.opacity = "0";
        return;
      }
      // First placement jumps into position instead of sliding in from 0.
      const transition = thumb.style.transition;
      if (!placed.current) thumb.style.transition = "none";
      thumb.style.width = btn.offsetWidth + "px";
      thumb.style.transform = "translateX(" + btn.offsetLeft + "px)";
      thumb.style.opacity = "1";
      if (!placed.current) {
        void thumb.offsetWidth;
        thumb.style.transition = transition;
        placed.current = true;
      }
      // If the tabs overflow, scroll so the active one sits in view (centred where possible).
      const left = btn.offsetLeft;
      const right = left + btn.offsetWidth;
      if (left < group.scrollLeft + 24 || right > group.scrollLeft + group.clientWidth - 24) {
        const target = Math.max(0, left - (group.clientWidth - btn.offsetWidth) / 2);
        if (typeof group.scrollTo === "function") group.scrollTo({ left: target, behavior: first ? "auto" : "smooth" });
        else group.scrollLeft = target;
      }
      first = false;
      fades();
    };
    // Fade the edge on whichever side has more tabs to scroll to.
    const fades = () => {
      const max = group.scrollWidth - group.clientWidth;
      group.dataset.fadeL = group.scrollLeft > 2 ? "1" : "0";
      group.dataset.fadeR = max - group.scrollLeft > 2 ? "1" : "0";
    };
    let first = true;

    place();
    // Re-measure when fonts load, the window resizes or a label changes width.
    const ro = new ResizeObserver(place);
    ro.observe(group);
    group.querySelectorAll("button").forEach((b) => ro.observe(b));
    group.addEventListener("scroll", fades, { passive: true });
    return () => { ro.disconnect(); group.removeEventListener("scroll", fades); };
  }, [tabsKey]);

  return <span ref={ref} style={css(style)} />;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fires once when the element first crosses into view. */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return { ref, seen };
}

/** Slide-and-fade a block in as it enters the viewport. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span" | "p";
}) {
  const { ref, seen } = useInView<HTMLDivElement>(0.15);
  return (
    <Tag
      ref={ref as never}
      className={`reveal ${seen ? "in" : ""} ${className}`}
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Counts up to `to` the first time it is seen. */
export function Counter({
  to,
  duration = 1600,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const { ref, seen } = useInView<HTMLSpanElement>(0.4);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      // easeOutExpo — fast start, long settle, reads as "landing" on a number
      setN(to * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);

  return (
    <span ref={ref} className="tick">
      {prefix}
      {n.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/** Pointer-following 3D tilt. Disabled on touch, where it just gets in the way. */
export function Tilt({
  children,
  className = "",
  max = 9,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${px * max * 2}deg) rotateX(${-py * max * 2}deg) translateZ(6px)`;
    el.style.setProperty("--mx", `${(px + 0.5) * 100}%`);
    el.style.setProperty("--my", `${(py + 0.5) * 100}%`);
  };

  const reset = () => {
    const el = ref.current;
    if (el) el.style.transform = "";
  };

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={reset} className={`tilt ${className}`}>
      {children}
    </div>
  );
}

/** A button that leans toward the cursor. Pure delight, zero function. */
export function Magnetic({
  children,
  className = "",
  href,
  strength = 0.35,
}: {
  children: ReactNode;
  className?: string;
  href: string;
  strength?: number;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${
      (e.clientY - r.top - r.height / 2) * strength
    }px)`;
  };

  return (
    <a
      ref={ref}
      href={href}
      onMouseMove={onMove}
      onMouseLeave={() => ref.current && (ref.current.style.transform = "")}
      className={`transition-transform duration-300 ease-out ${className}`}
    >
      {children}
    </a>
  );
}

/** Thin progress bar pinned to the top of the page. */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? h.scrollTop / max : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[2px] bg-transparent">
      <div
        className="h-full origin-left bg-gradient-to-r from-saffron-500 via-amber-300 to-emerald-400"
        style={{ transform: `scaleX(${p})` }}
      />
    </div>
  );
}

/** Headline that assembles itself word by word on first view. */
export function WordsIn({
  text,
  className = "",
  stagger = 70,
}: {
  text: string;
  className?: string;
  stagger?: number;
}) {
  const { ref, seen } = useInView<HTMLSpanElement>(0.25);
  return (
    <span
      ref={ref}
      className={`words ${seen ? "in" : ""} ${className}`}
      style={{ ["--stagger" as string]: `${stagger}ms` }}
    >
      {text.split(" ").map((w, i) => (
        <span key={`${w}-${i}`} className="w-clip">
          <span className="w" style={{ ["--i" as string]: i }}>
            {w}
            {"\u00A0"}
          </span>
        </span>
      ))}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

const LINKS = [
  { href: "#demo", label: "Demo" },
  { href: "#why", label: "Why Baari" },
  { href: "#compare", label: "Compare" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        solid ? "border-b border-white/[0.07] bg-[#07090d]/85 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5">
        <a href="#top" className="group flex items-baseline gap-2">
          <span className="u-display text-xl font-extrabold tracking-tight text-white">baari</span>
          <span className="u-deva text-sm text-saffron-400 transition-transform duration-300 group-hover:translate-x-0.5">
            बारी
          </span>
        </a>

        <ul className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="relative rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:text-white"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="/login"
          className="ml-auto hidden items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-[#07090d] transition-transform duration-300 hover:scale-[1.04] md:ml-0 md:flex"
        >
          Staff sign in
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>

        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-lg p-2 text-slate-300 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/[0.07] bg-[#07090d] px-5 pb-5 pt-2 md:hidden">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block border-b border-white/[0.05] py-3 text-sm font-medium text-slate-300"
            >
              {l.label}
            </a>
          ))}
          <a
            href="/login"
            className="mt-4 block rounded-full bg-white py-3 text-center text-sm font-bold text-[#07090d]"
          >
            Staff sign in
          </a>
        </div>
      )}
    </header>
  );
}

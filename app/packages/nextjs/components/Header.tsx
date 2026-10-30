"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, BugAntIcon, ShieldCheckIcon, Squares2X2Icon, TrophyIcon } from "@heroicons/react/24/outline";
import { AnimatedBackground } from "~~/components/motion-primitives/animated-background";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: <Squares2X2Icon className="h-4 w-4" />,
  },
  {
    label: "Arena",
    href: "/arena",
    icon: <TrophyIcon className="h-4 w-4" />,
  },
  // Judges see a clean nav on the live site; /debug still works by URL for anyone who wants raw contract calls.
  ...(process.env.NODE_ENV === "production"
    ? []
    : [{ label: "Debug Contracts", href: "/debug", icon: <BugAntIcon className="h-4 w-4" /> }]),
];

/** Mobile dropdown list (plain DaisyUI menu). */
export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${isActive ? "font-semibold text-ink" : "text-muted"} gap-2 text-sm hover:text-ink`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Desktop tabs: a glass pill slides between them (animated-background, keyed by the current route, so the
 * header, which persists across pages, animates the highlight to the new tab on navigation).
 */
const DesktopNav = () => {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 lg:flex">
      <AnimatedBackground
        defaultValue={pathname}
        className="rounded-full border border-silver-200/25 bg-silver-100/10 shadow-glow-silver"
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
      >
        {menuLinks.map(({ label, href, icon }) => (
          <Link
            key={href}
            data-id={href}
            href={href}
            className={`items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors duration-200 ${
              pathname === href ? "font-semibold text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-2">
              {icon}
              {label}
            </span>
          </Link>
        ))}
      </AnimatedBackground>
    </nav>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    // leash-bar: glass on a pseudo-element (see globals.css: keeps the wallet modals inside working).
    <div className="leash-bar sticky top-0 z-20 navbar min-h-16 shrink-0 justify-between p-0 sm:px-2 lg:relative">
      <div className="navbar-start w-auto self-stretch">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
            <Bars3Icon className="h-1/2" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 w-52 rounded-box bg-base-100 p-2 shadow-lg"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link href="/" passHref className="ml-4 mr-6 hidden shrink-0 items-center gap-3 lg:flex">
          <ShieldCheckIcon className="leash-hover-icon h-8 w-8 text-silver-200" />
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-bold leading-tight text-ink">Leash</span>
            <span className="leash-eyebrow text-[10px]">Agent spending vault</span>
          </div>
        </Link>
        <DesktopNav />
      </div>
      <div className="navbar-end grow mr-4">
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
      </div>
    </div>
  );
};

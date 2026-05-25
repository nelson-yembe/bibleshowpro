import { NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  Cross,
  Home,
  Image,
  Layers,
  Music2,
  Palette,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/service", icon: Layers, label: "Library" },
  { to: "/bible", icon: BookOpen, label: "Bible Search", match: "/bible" },
  { to: "/songs", icon: Music2, label: "Songs", match: "/songs" },
  { to: "/media", icon: Image, label: "Media" },
  { to: "/themes", icon: Palette, label: "Themes" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function IconRail() {
  const { pathname } = useLocation();

  return (
    <aside className="flex w-[48px] shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[#080a0f] py-2">
      <NavLink
        to="/"
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-primary)] text-white"
        title="Bible Show Pro"
      >
        <Cross className="h-3.5 w-3.5" />
      </NavLink>

      <nav className="flex flex-1 flex-col items-center gap-0.5">
        {navItems.map(({ to, icon: Icon, label, match }) => {
          const active = match ? pathname.startsWith(match) : pathname === to;

          return (
            <NavLink
              key={label}
              to={to}
              title={label}
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-foreground)]",
                match && active && "bg-[var(--color-primary)] text-white hover:text-white",
                !match && active && "text-[var(--color-primary)]",
              )}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto pb-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-semibold text-white">
          JM
        </div>
      </div>
    </aside>
  );
}

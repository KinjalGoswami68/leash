import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Used by the Motion Primitives components: merges class lists so a passed className can override a default.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

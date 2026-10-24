import { Tabs } from "radix-ui";
import { cn } from "../../lib/utils.js";

export function TabsRoot(props) {
  return <Tabs.Root {...props} />;
}

export function TabsList({ className, ...props }) {
  return <Tabs.List className={cn("inline-flex w-fit items-center gap-1 rounded-xl border border-[#263844] bg-[#0c141b] p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }) {
  return <Tabs.Trigger className={cn("min-h-10 rounded-lg px-4 text-sm font-semibold text-[#9eafb9] outline-none transition-colors hover:text-[#edf6f8] focus-visible:ring-2 focus-visible:ring-[#5eead4] data-[state=active]:bg-[#1c2a34] data-[state=active]:text-[#f3fbfc] data-[state=active]:shadow-sm", className)} {...props} />;
}

export function TabsContent({ className, ...props }) {
  return <Tabs.Content className={cn("outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]", className)} {...props} />;
}

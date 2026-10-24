import { Tabs } from "radix-ui";
import { cn } from "../../lib/utils.js";

export function TabsRoot(props) {
  return <Tabs.Root {...props} />;
}

export function TabsList({ className, ...props }) {
  return <Tabs.List className={cn("inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }) {
  return <Tabs.Trigger className={cn("min-h-10 rounded-md px-4 text-sm font-semibold text-slate-600 outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm", className)} {...props} />;
}

export function TabsContent({ className, ...props }) {
  return <Tabs.Content className={cn("outline-none focus-visible:ring-2 focus-visible:ring-blue-600", className)} {...props} />;
}

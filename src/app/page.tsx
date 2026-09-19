import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Graph Notes</h1>
      <p className="max-w-md text-muted-foreground">
        Nested whiteboards and documents for teams.
      </p>
      <Button disabled>Sign in (coming soon)</Button>
    </main>
  );
}

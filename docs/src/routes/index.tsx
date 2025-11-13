import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { SystemDesignAnimation } from "@/components/SystemDesignAnimation";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout
      {...baseOptions()}
      className={`py-24 justify-center gap-10 mx-auto`}
    >
      <div className="space-y-4 mx-auto flex flex-col items-center justify-center mt-4">
        <p className="text-muted-foreground text-center text-3xl font-medium">
          The Typescript toolkit for ambitious voice AI apps
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="px-4 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm"
          >
            Get started
          </Link>
          <code className="font-mono px-4 py-2 rounded-lg border border-muted-foreground/30 font-medium text-sm text-muted-foreground">
            npm i usevoiceai
          </code>
        </div>
      </div>

      <SystemDesignAnimation />
    </HomeLayout>
  );
}

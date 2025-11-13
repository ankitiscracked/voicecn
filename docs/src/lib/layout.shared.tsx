import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "useVoiceAI",
      url: "/",
    },
    links: [
      {
        type: "main",
        text: "Documentation",
        description: "Browse the reference guides and API docs.",
        url: "/docs",
        active: "nested-url",
      },
      {
        type: "button",
        text: "Quickstart",
        url: "/docs/quickstart",
      },
    ],
  };
}

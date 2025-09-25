// web/test/trpc.stub.ts
// Test-only TRPC stub: no Provider needed. Includes a no-op withTRPC()
// and minimal mutations so specs can exercise happy paths.

import React from "react";

type AppRow = {
  company: string;
  role: string;
  status: "APPLIED" | "INTERVIEW" | "OFFER" | string;
  updated: string;
};

let trackerData: AppRow[] = [
  { company: "Acme",    role: "—", status: "APPLIED",   updated: "—" },
  { company: "Globex",  role: "—", status: "INTERVIEW", updated: "—" },
  { company: "Initech", role: "—", status: "OFFER",     updated: "—" }, // keeps “Offer” visible
];

type Settings = {
  notifications: boolean;
  theme: "light" | "dark";
  weeklySummary: boolean;
};

let settings: Settings = {
  notifications: true,
  theme: "light",
  weeklySummary: true,
};

export const trpc = {
  tracker: {
    getApplications: {
      useQuery(
        _input?: { userId?: string },
        _opts?: { keepPreviousData?: boolean }
      ) {
        return {
          data: trackerData,
          isLoading: false,
          error: null as Error | null,
        };
      },
    },
    add: {
      useMutation() {
        return {
          mutate: (row: Partial<AppRow>) => {
            const item: AppRow = {
              company: row.company ?? "NewCo",
              role: row.role ?? "—",
              status: (row.status as AppRow["status"]) ?? "APPLIED",
              updated: row.updated ?? "—",
            };
            trackerData = [...trackerData, item];
          },
        };
      },
    },
  },
  settings: {
    get: {
      useQuery() {
        return {
          data: settings,
          isLoading: false,
          error: null as Error | null,
        };
      },
    },
    update: {
      useMutation() {
        return {
          mutate: (patch: Partial<Settings>) => {
            settings = { ...settings, ...patch };
          },
        };
      },
    },
  },
};

// No-op HOC for any code that expects `withTRPC(App)` — no JSX to avoid TSX parsing.
export function withTRPC<TProps = unknown>(App: React.ComponentType<TProps>) {
  return function WithTrpc(props: TProps) {
    return React.createElement(App, props);
  };
}

// Handy reset for tests
export function __resetTrackerStub(rows?: AppRow[]) {
  trackerData =
    rows ?? [
      { company: "Acme",    role: "—", status: "APPLIED",   updated: "—" },
      { company: "Globex",  role: "—", status: "INTERVIEW", updated: "—" },
      { company: "Initech", role: "—", status: "OFFER",     updated: "—" },
    ];
}

export type { AppRow, Settings };
export default trpc;

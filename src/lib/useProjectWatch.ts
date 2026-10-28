import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Project } from "../types";
import { desktop, refreshProject, startProjectWatch, stopProjectWatch, type WatchLease } from "./filesystem";

export function useProjectWatch(project: Project | null, enabled: boolean, paused: boolean, onProject: (project: Project) => void) {
  const [status, setStatus] = useState({ active: false, updating: false, error: "" });
  const [attempt, setAttempt] = useState(0);
  const current = useRef({ project, paused, onProject }); current.current = { project, paused, onProject };
  const lease = useRef<WatchLease | null>(null);
  const dirty = useRef(false);
  const nativeError = useRef("");
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const schedule = useRef<() => void>(() => {});
  schedule.current = () => {
    if (disposed.current || !dirty.current || !lease.current?.active || current.current.paused || running.current || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const path = current.current.project?.path;
      if (!path || current.current.paused || disposed.current) return;
      const id = lease.current?.id;
      running.current = true; dirty.current = false;
      setStatus((s) => ({ ...s, updating: true }));
      void refreshProject(path).then((next) => {
        if (disposed.current || lease.current?.id !== id || current.current.project?.path !== path) return;
        if (current.current.paused) { dirty.current = true; return; }
        current.current.onProject(next);
        setStatus((s) => ({ ...s, error: nativeError.current }));
      }).catch((e) => {
        if (!disposed.current && lease.current?.id === id) setStatus((s) => ({ ...s, error: String(e) }));
      }).finally(() => {
        running.current = false;
        if (!disposed.current) { setStatus((s) => ({ ...s, updating: false })); schedule.current(); }
      });
    }, 300);
  };
  useEffect(() => { schedule.current(); });
  useEffect(() => {
    if (!desktop || !project?.path || !enabled) { lease.current = null; setStatus({ active: false, updating: false, error: "" }); return; }
    disposed.current = false; nativeError.current = "";
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let own: WatchLease | null = null;
    const begin = async () => {
      unlisten = await listen<{ id: number; path: string; error: string | null }>("assetflow:project-change", ({ payload }) => {
        if (cancelled || payload.id !== lease.current?.id || payload.path !== current.current.project?.path) return;
        dirty.current = true;
        if (payload.error) { nativeError.current = payload.error; setStatus((s) => ({ ...s, error: payload.error! })); }
        schedule.current();
      });
      if (cancelled) { unlisten(); return; }
      own = await startProjectWatch();
      if (cancelled) { void stopProjectWatch(own.id).catch(() => {}); return; }
      lease.current = own;
      setStatus({ active: own.active, updating: false, error: own.error ?? "" });
      // Close the gap between the initial scan and attaching the native watcher.
      dirty.current = true; schedule.current();
    };
    void begin().catch((e) => { if (!cancelled) setStatus({ active: false, updating: false, error: String(e) }); });
    return () => {
      cancelled = true; disposed.current = true; unlisten?.();
      if (timer.current) clearTimeout(timer.current); timer.current = null;
      dirty.current = false;
      if (own) void stopProjectWatch(own.id).catch(() => {});
      if (lease.current?.id === own?.id) lease.current = null;
    };
  }, [project?.path, enabled, attempt]);
  return { ...status, retry: () => setAttempt((n) => n + 1) };
}

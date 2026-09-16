"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import styles from "./live-photo.module.css";

import type { CSSProperties, ReactNode } from "react";

/** The motion of one Live Photo; its still is the frame's child. */
export interface LivePhotoMotion {
  readonly motionSrc: string;
  readonly hasAudio: boolean;
}

export type LivePhotoPlayback = "idle" | "loading" | "playing" | "failed";

/** Below this visible share the frame counts as having left the view. */
export const LIVE_PHOTO_VISIBLE_RATIO = 0.5;

export interface LivePhotoFrameProps {
  /**
   * Only an active frame owns a video element and may load its motion; an
   * inactive one (another slide, a closed or covered overlay) is reset.
   */
  readonly active: boolean;
  /** The still, exactly as the surface presents it without motion. */
  readonly children: ReactNode;
  readonly className?: string | undefined;
  /**
   * Marks the control group so the host's swipe, pan and zoom gestures ignore
   * pointers that start on it (e.g. `data-detail-media-control`).
   */
  readonly controlAttributes?: Readonly<Record<`data-${string}`, string>>;
  readonly motion: LivePhotoMotion;
  /** Keeps the video on the still's geometry (e.g. the Viewer's zoom). */
  readonly videoClassName?: string | undefined;
  readonly videoStyle?: CSSProperties | undefined;
}

const LiveIcon = () => (
  <svg
    aria-hidden="true"
    className={styles.icon}
    focusable="false"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="12" r="9" strokeDasharray="1.6 2.1" />
    <circle cx="12" cy="12" r="5.2" />
    <circle className={styles.iconDot} cx="12" cy="12" r="1.9" />
  </svg>
);

const SoundIcon = ({ on }: { readonly on: boolean }) => (
  <svg
    aria-hidden="true"
    className={styles.icon}
    focusable="false"
    viewBox="0 0 24 24"
  >
    <path d="M4.5 9.5h3l4.5-3.8v12.6l-4.5-3.8h-3z" />
    {on ? (
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6m2.6-8.6a7.8 7.8 0 0 1 0 11.2" />
    ) : (
      <path d="m15.5 9.5 5 5m0-5-5 5" />
    )}
  </svg>
);

/** Detaches the motion so the browser stops fetching and decoding it. */
const release = (video: HTMLVideoElement) => {
  video.pause();
  if (video.hasAttribute("src")) {
    video.removeAttribute("src");
    video.load();
  }
  video.muted = true;
};

/**
 * A still with an explicit 播放实况 control (L08, L11, L12). Nothing plays by
 * itself: the motion source is set only when the viewer activates the
 * control, plays inline and muted first, and the 声音 toggle appears only when
 * the motion has audio. Leaving the view, becoming inactive, the page hiding
 * or unmounting stops playback and returns to the still. A decode or load
 * failure keeps the still and says so.
 */
export const LivePhotoFrame = ({
  active,
  children,
  className,
  controlAttributes,
  motion,
  videoClassName,
  videoStyle,
}: LivePhotoFrameProps) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Every start or stop begins a new generation; late media events are ignored.
  const generationRef = useRef(0);
  // The generation of the playback that owns the motion source, if any.
  const runningRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [playback, setPlayback] = useState<LivePhotoPlayback>("idle");
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const [muted, setMuted] = useState(true);
  const controlsRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  // Set when a playback change is about to remove the focused control.
  const refocusRef = useRef(false);

  /** Remembers whether the controls hold the focus before a state change. */
  const noteFocus = useCallback(() => {
    const controls = controlsRef.current;
    if (controls !== null && controls.contains(document.activeElement))
      refocusRef.current = true;
  }, []);

  const stop = useCallback(() => {
    if (playbackRef.current !== "idle") noteFocus();
    generationRef.current += 1;
    runningRef.current = null;
    const video = videoRef.current;
    if (video !== null) release(video);
    setMuted(true);
    setPlayback("idle");
  }, [noteFocus]);

  const fail = useCallback(
    (generation: number) => {
      if (generation !== generationRef.current) return;
      noteFocus();
      generationRef.current += 1;
      runningRef.current = null;
      const video = videoRef.current;
      if (video !== null) release(video);
      setMuted(true);
      setPlayback("failed");
    },
    [noteFocus],
  );

  // Stable, so re-rendering never detaches (and so stops) a playing video.
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    return () => {
      if (video !== null) release(video);
      if (videoRef.current === video) videoRef.current = null;
    };
  }, []);

  const play = () => {
    const video = videoRef.current;
    if (video === null || !activeRef.current) return;
    generationRef.current += 1;
    const generation = generationRef.current;
    runningRef.current = generation;
    // Muted first, every time; audio needs the separate explicit toggle.
    video.defaultMuted = true;
    video.muted = true;
    setMuted(true);
    if (video.getAttribute("src") !== motion.motionSrc) {
      video.setAttribute("src", motion.motionSrc);
    } else {
      video.currentTime = 0;
    }
    setPlayback("loading");
    let started: Promise<void> | undefined;
    try {
      started = video.play();
    } catch {
      fail(generation);
      return;
    }
    void Promise.resolve(started).catch(() => fail(generation));
  };

  const toggleSound = () => {
    const video = videoRef.current;
    if (video === null) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  // A control removed by the change (声音 when motion ends, 播放实况 on a
  // failure) hands the focus on: to 播放实况, or to the failure message.
  useLayoutEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    const controls = controlsRef.current;
    if (controls === null || controls.contains(document.activeElement)) return;
    const target = playback === "failed" ? statusRef.current : playRef.current;
    target?.focus({ preventScroll: true });
  }, [playback]);

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  // A different motion is a different item: never carry playback across.
  useEffect(() => stop, [motion.motionSrc, stop]);

  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", stop);
    };
  }, [stop]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!active || frame === null || typeof IntersectionObserver !== "function")
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            !entry.isIntersecting ||
            entry.intersectionRatio < LIVE_PHOTO_VISIBLE_RATIO
          )
            stop();
        }
      },
      { threshold: [0, LIVE_PHOTO_VISIBLE_RATIO] },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [active, stop]);

  const running = playback === "loading" || playback === "playing";

  return (
    <div
      className={className ? `${styles.frame} ${className}` : styles.frame}
      data-live-photo=""
      data-live-playback={playback}
      ref={frameRef}
    >
      {children}
      {active ? (
        <video
          aria-hidden="true"
          className={
            videoClassName ? `${styles.video} ${videoClassName}` : styles.video
          }
          data-live-video=""
          data-visible={playback === "playing" ? "true" : "false"}
          disablePictureInPicture
          disableRemotePlayback
          muted
          onEnded={(event) => {
            // One pass, then the still again; the loaded motion may replay.
            noteFocus();
            generationRef.current += 1;
            runningRef.current = null;
            event.currentTarget.pause();
            setMuted(true);
            event.currentTarget.muted = true;
            setPlayback("idle");
          }}
          onError={() => {
            const running = runningRef.current;
            if (running !== null) fail(running);
          }}
          onPause={(event) => {
            // A pause the page did not ask for (e.g. the system) ends playback.
            if (event.currentTarget.ended) return;
            if (playbackRef.current === "playing") noteFocus();
            setPlayback((current) =>
              current === "playing" ? "idle" : current,
            );
          }}
          onPlaying={() =>
            setPlayback((current) =>
              current === "loading" ? "playing" : current,
            )
          }
          playsInline
          preload="none"
          ref={attachVideo}
          style={videoStyle}
          tabIndex={-1}
        />
      ) : null}
      <div
        className={styles.controls}
        data-live-photo-controls=""
        ref={controlsRef}
        {...controlAttributes}
      >
        {playback === "failed" ? null : (
          <>
            <button
              className={styles.control}
              data-live-photo-play=""
              onClick={running ? stop : play}
              ref={playRef}
              type="button"
            >
              <span className={styles.pill}>
                <LiveIcon />
                {running ? "停止实况" : "播放实况"}
              </span>
            </button>
            {motion.hasAudio && running ? (
              <button
                aria-pressed={!muted}
                className={styles.control}
                data-live-photo-sound=""
                onClick={toggleSound}
                type="button"
              >
                <span className={styles.pill}>
                  <SoundIcon on={!muted} />
                  声音
                </span>
              </button>
            ) : null}
          </>
        )}
        {/*
         * Always mounted so the failure is announced politely when it appears;
         * it takes the focus if the removed 播放实况 control had it.
         */}
        <span
          aria-live="polite"
          className={
            playback === "failed" ? styles.message : styles.visuallyHidden
          }
          data-live-photo-failure={playback === "failed" ? "" : undefined}
          data-live-photo-status=""
          ref={statusRef}
          role="status"
          tabIndex={-1}
        >
          {playback === "failed" ? (
            <>
              <LiveIcon />
              动态影像无法播放
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
};

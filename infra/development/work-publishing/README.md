# Work publishing — Development media tools

**Development only.** This directory provides the locally built, sandboxed
toolchain the Development Backend uses to create server derivatives for work
publishing (`docs/community/work-publishing-v1.md`): HEIC/HEIF still decoding
and Live Photo motion probing and transcoding. It is never deployed, pushed to a
registry, distributed or used in Production; a Production processing toolchain
is outside this task.

JPEG, PNG and WebP stills are decoded in the Backend process by `sharp`; only
HEIC/HEIF stills and motion components go through this image.

## Build

```sh
docker build -t yoyi-work-publishing-media-tools:v1 infra/development/work-publishing/media-tools
```

- Base:
  `debian:trixie-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132`
  (pinned digest).
- Packages, installed with `--no-install-recommends` and pinned to exact Debian
  trixie versions: `ffmpeg`, `libavcodec61`, `libavformat61` and `libavfilter10`
  `7:7.1.5-0+deb13u1`; `libx264-164` `2:0.164.3108+git31e19f9-2+b1`; `libzimg2`
  `3.0.5+ds1-1+b2` (zscale colour conversion); `libheif-examples` (`heif-dec`),
  `libheif1` and `libheif-plugin-libde265` `1.19.8-1+deb13u1`; `libde265-0`
  `1.0.15-1+deb13u2`.
- Reproducibility: when Debian supersedes a pinned version (for example with a
  security update) the build fails rather than silently changing the toolchain.
  Update the pins deliberately and re-run the checks below. Other transitive
  packages follow the Debian mirror at build time, so a rebuild can still differ
  in those.
- User: non-root `media`, uid/gid `10001`, working directory `/tmp`. No default
  entrypoint (`/bin/false`); every run names its tool explicitly.

Check the built toolchain:

```sh
docker run --rm --network none --entrypoint ffmpeg yoyi-work-publishing-media-tools:v1 -hide_banner -version
docker run --rm --network none --entrypoint heif-dec yoyi-work-publishing-media-tools:v1 --list-decoders
docker run --rm --network none --entrypoint ffmpeg yoyi-work-publishing-media-tools:v1 -hide_banner -filters | grep -E ' (zscale|tonemap|setparams) '
```

## How the Backend runs it

The Development composition passes `WORK_MEDIA_TOOLS_IMAGE` (the tag above) to
the media tools runner in
`services/backend-production/src/publishing/processing/media-tools.ts`. The
runner spawns `docker` directly with an argument array (never a shell), one
container per tool invocation:

```text
docker run --rm --pull never --name yoyi-wp-media-<24hex>
  --network none --read-only --tmpfs /tmp:rw,size=512m
  --memory 1536m --cpus 2 --pids-limit 256
  --security-opt no-new-privileges --cap-drop ALL --user 10001:10001
  --mount type=bind,source=<work>/job-<32hex>/in,target=/job/in,readonly
  [--mount type=bind,source=<work>/job-<32hex>/out-<16hex>,target=/job/out]
  --workdir /tmp --entrypoint /usr/bin/timeout
  yoyi-work-publishing-media-tools:v1
  --signal=KILL <host limit + 10 s> <heif-dec|ffprobe|ffmpeg> <tool arguments>
```

- `--pull never`: a missing image fails instead of reaching the network.
- Work directory: the configured work directory must be an absolute, existing,
  owner-only (`0700`) directory owned by the Backend user, outside `/tmp`,
  `/private/tmp`, `/var/folders` and any Git working tree (the same rules as
  `WORK_MEDIA_STORE_DIR`). Each job gets `job-<32hex>/` (`0700`).
- Read-only input: `in/` (`0755`, files `0644`) is written only by the Backend
  and mounted read-only. It holds the component copies and every accepted tool
  output.
- Writable output, one per run: only `heif-dec` and `ffmpeg` get a writable
  mount, and each run gets its own fresh, empty `out-<16hex>/`. `ffprobe` gets
  none. The container runs as uid `10001`, which does not own the host
  directories, so `out-<16hex>/` is `0777`. It stays unreachable to other host
  users because its parent job directory is `0700`. On Docker Desktop for macOS
  bind-mount ownership is translated and the same modes apply.
- Accepting output: after the container exits, the run directory must contain
  exactly the expected file. The Backend opens it without following links or
  blocking on FIFOs, requires a regular file between 1 byte and 1 GiB, copies it
  into `in/`, then deletes the run directory. Later containers and `sharp` only
  ever read that host-written copy, so a compromised later tool cannot swap an
  accepted output for a link.
- Sweeping: every run touches its job directory. Jobs still active in the
  Backend process are never swept. The sweep cutoff must be older than the
  worker lease.
- Inputs are sniffed by the Backend before any tool runs. The demuxer is pinned
  with `-f mov` for `ffprobe`/`ffmpeg`.
- Hard wall-clock limits: `heif-dec` 60 s, `ffprobe` 20 s, `ffmpeg` 180 s.
  - The runner acts on timeout, output overflow or cancellation. Overflow means
    stdout over 1 MiB for `ffprobe` or 64 KiB otherwise, or stderr over 64 KiB
    (counted and discarded).
  - It runs `docker kill <name>`, SIGKILLs the CLI after a grace period and runs
    `docker rm --force <name>` twice: at once and again after the grace period,
    in case the kill raced container creation.
  - Inside the container, `timeout --signal=KILL` ends the tool 10 s after the
    host limit, even if the host lost track of the container.
- Tool output is never logged. Rejections are recorded as content-free codes
  from the contracts `mediaFailureCodeSchema`.

Tool invocations:

- `heif-dec --quiet /job/in/still /job/out/still.png`: primary image only, with
  `irot`/`imir`/`clap` applied by libheif; auxiliary or multi-image output is
  refused. HEIF files with image-sequence brands (`msf1`, `hevc`, …) or a `moov`
  box are rejected before decoding, and so are APNGs (`acTL` before `IDAT`).
- `ffprobe -v error -f mov -show_streams -show_format -of json /job/in/<name>`
  is accepted only when all of these hold:
  - exactly one video stream, at most one audio stream and at most 8 data (timed
    metadata) streams;
  - duration ≤ 30 s and each dimension ≤ 8192;
  - colour tags on the allowlist (see `MOTION_COLOR` in `profiles.ts`).
- `ffmpeg -nostdin -n -f mov -i /job/in/motion -map 0:v:0 -map 0:a:0? -map_metadata -1 -map_chapters -1 -dn -sn -vf <setparams,rotation,crop,scale,colour> -c:v libx264 -profile:v high -preset veryfast -crf 21 -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -c:a aac -b:a 128k -movflags +faststart -f mp4 /job/out/motion-output.mp4`
  - Autorotation stays enabled and the edit is baked into pixels, so every
    browser shows the same orientation. The long edge is ≤ 1920.
  - Crops use the same whole-pixel rounding as still derivatives.
  - Colour: untagged or BT.709 8-bit sources pass through. Other SDR colour
    spaces are converted with `zscale`. HLG and PQ sources are tone-mapped to
    SDR (`zscale` linearize at 100 nits, `tonemap=hable`, BT.709).
  - The output is re-probed and must be H.264 `yuv420p` tagged BT.709 limited
    range, upright, with AAC audio when the source had audio, and within 100 ms
    of the source duration.
  - Derivatives never claim HDR; originals keep theirs.

## Licenses

- FFmpeg: the Debian package is built with `--enable-gpl` (including libx264 and
  libx265), so this build is GPL-2.0-or-later.
- x264: GPL-2.0-or-later.
- zimg: WTFPL-2.
- libheif and libde265: LGPL-3.0-or-later (libheif example programs such as
  `heif-dec` are MIT).
- Debian base image: the licenses of the respective Debian packages
  (`/usr/share/doc/*/copyright` inside the image).

The image is built and used locally for Development only and is not distributed.
H.264/HEVC patent licensing is not assessed for any other use.

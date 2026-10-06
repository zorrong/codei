/**
 * paths — chuẩn hoá đường dẫn tương đối về POSIX (forward slashes).
 * Windows `path.relative` trả về backslash, trong khi git, tree nodeId
 * (`file:src/...`) và tests đều dùng forward slash.
 */

import * as path from "path"

/** Đổi mọi separator về `/`. Trên POSIX là identity. */
export function toPosixPath(p: string): string {
  return p.split(path.sep).join(path.posix.sep)
}

/** `path.relative` + chuẩn hoá POSIX. Dùng cho mọi relative path trong index. */
export function relativePosix(from: string, to: string): string {
  return toPosixPath(path.relative(from, to))
}

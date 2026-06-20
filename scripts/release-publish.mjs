import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)))
const packagesDir = join(rootDir, "packages")
const isDryRun = process.argv.includes("--dry-run")

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function run(command, args, cwd) {
  const rendered = [command, ...args].join(" ")
  console.log(`> ${rendered}`)

  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
  })
}

function getPublicPackages() {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(packagesDir, entry.name)
      const manifest = readJson(join(dir, "package.json"))
      return {
        dir,
        manifest,
      }
    })
    .filter(({ manifest }) => manifest.private !== true)
}

function topoSortPackages(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]))
  const visitState = new Map()
  const sorted = []

  function getInternalDeps(pkg) {
    const deps = pkg.manifest.dependencies ?? {}
    return Object.keys(deps).filter((name) => byName.has(name))
  }

  function visit(pkg) {
    const current = visitState.get(pkg.manifest.name)
    if (current === "done") return
    if (current === "visiting") {
      throw new Error(`Circular publish dependency detected at ${pkg.manifest.name}`)
    }

    visitState.set(pkg.manifest.name, "visiting")
    for (const depName of getInternalDeps(pkg)) {
      visit(byName.get(depName))
    }
    visitState.set(pkg.manifest.name, "done")
    sorted.push(pkg)
  }

  for (const pkg of packages) {
    visit(pkg)
  }

  return sorted
}

function main() {
  const packages = topoSortPackages(getPublicPackages())

  run("node", ["scripts/release-check.mjs"], rootDir)

  if (isDryRun) {
    console.log("Dry-run publish order:")
    for (const pkg of packages) {
      console.log(`- ${pkg.manifest.name}@${pkg.manifest.version}`)
    }
    console.log("")
    console.log("Commands that would run:")
    for (const pkg of packages) {
      console.log(`- (cd ${pkg.dir} && pnpm publish --access public)`)
    }
    return
  }

  for (const pkg of packages) {
    const args = ["publish", "--access", "public"]
    run("pnpm", args, pkg.dir)
  }
}

main()

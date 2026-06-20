import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { PythonAdapter } from "../../adapter-python/src/PythonAdapter.js"
import { GoAdapter } from "../../adapter-go/src/GoAdapter.js"
import { JavaAdapter } from "../../adapter-java/src/JavaAdapter.js"
import { PhpAdapter } from "../../adapter-php/src/PhpAdapter.js"
import { RustAdapter } from "../../adapter-rust/src/RustAdapter.js"
import { CSharpAdapter } from "../../adapter-csharp/src/CSharpAdapter.js"
import { CppAdapter } from "../../adapter-cpp/src/CppAdapter.js"
import { SwiftAdapter } from "../../adapter-swift/src/SwiftAdapter.js"

describe("regex adapter smoke tests", () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codeindex-adapter-smoke-"))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const cases = [
    {
      name: "python",
      adapter: new PythonAdapter(),
      fileName: "user_service.py",
      content: [
        "import os",
        "",
        "class UserService:",
        "    pass",
        "",
        "def login():",
        "    return True",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
    {
      name: "go",
      adapter: new GoAdapter(),
      fileName: "user_service.go",
      content: [
        "package main",
        "",
        "import \"fmt\"",
        "",
        "type UserService struct{}",
        "",
        "func Login() {}",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
    {
      name: "java",
      adapter: new JavaAdapter(),
      fileName: "UserService.java",
      content: [
        "package demo;",
        "",
        "import java.util.List;",
        "",
        "public class UserService {",
        "  public void login() {}",
        "}",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
    {
      name: "php",
      adapter: new PhpAdapter(),
      fileName: "UserService.php",
      content: [
        "<?php",
        "namespace App;",
        "",
        "use App\\Models\\User;",
        "",
        "class UserService {",
        "    public function login() {}",
        "}",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
    {
      name: "rust",
      adapter: new RustAdapter(),
      fileName: "user_service.rs",
      content: [
        "use std::collections::HashMap;",
        "",
        "pub struct UserService {}",
        "",
        "pub fn login() {}",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
    {
      name: "csharp",
      adapter: new CSharpAdapter(),
      fileName: "UserService.cs",
      content: [
        "using System;",
        "",
        "namespace Demo {",
        "  public class UserService {",
        "    public void Login() {}",
        "  }",
        "}",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
    {
      name: "cpp",
      adapter: new CppAdapter(),
      fileName: "user_service.cpp",
      content: [
        "#include <iostream>",
        "",
        "class UserService {};",
        "",
        "void login() {}",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
    {
      name: "swift",
      adapter: new SwiftAdapter(),
      fileName: "UserService.swift",
      content: [
        "import Foundation",
        "",
        "class UserService {}",
        "",
        "func login() {}",
      ].join("\n"),
      expectedSymbol: "UserService",
    },
  ] as const

  for (const testCase of cases) {
    it(`parses ${testCase.name} source file`, async () => {
      const filePath = path.join(tmpDir, testCase.fileName)
      await fs.writeFile(filePath, testCase.content, "utf-8")

      expect(testCase.adapter.supports(filePath)).toBe(true)

      const parsed = await testCase.adapter.parseFile(filePath, tmpDir)
      const symbolNames = parsed.symbols.map((symbol) => symbol.name)

      expect(parsed.filePath).toBe(filePath)
      expect(parsed.symbols.length).toBeGreaterThan(0)
      expect(symbolNames).toContain(testCase.expectedSymbol)
    })
  }
})

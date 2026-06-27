/**
 * SymbolExtractor — extract RawSymbol[] từ một ts-morph SourceFile.
 * Xử lý: class, method, function, interface, type alias, enum, variable/const.
 */

import {
  type SourceFile,
  type ClassDeclaration,
  type MethodDeclaration,
  type FunctionDeclaration,
  type InterfaceDeclaration,
  type TypeAliasDeclaration,
  type EnumDeclaration,
  type VariableStatement,
  VariableDeclarationKind,
  type JSDoc,
} from "ts-morph"
import type { RawSymbol, SymbolKind } from "pnftrading_codei-core"

export class SymbolExtractor {
  extract(sourceFile: SourceFile): RawSymbol[] {
    const symbols: RawSymbol[] = []

    // Classes + their methods
    for (const cls of sourceFile.getClasses()) {
      symbols.push(this.extractClass(cls))
      for (const method of cls.getMethods()) {
        symbols.push(this.extractMethod(method, cls.getName() ?? ""))
      }
    }

    // Top-level functions
    for (const fn of sourceFile.getFunctions()) {
      symbols.push(this.extractFunction(fn))
    }

    // Interfaces
    for (const iface of sourceFile.getInterfaces()) {
      symbols.push(this.extractInterface(iface))
    }

    // Type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      symbols.push(this.extractTypeAlias(typeAlias))
    }

    // Enums
    for (const enumDecl of sourceFile.getEnums()) {
      symbols.push(this.extractEnum(enumDecl))
    }

    // Exported variables/constants
    for (const varStatement of sourceFile.getVariableStatements()) {
      if (varStatement.isExported()) {
        symbols.push(...this.extractVariableStatement(varStatement))
      }
    }

    return symbols
  }

  // ─── Private extractors ───────────────────────────────────────────────────

  private extractClass(cls: ClassDeclaration): RawSymbol {
    const name = cls.getName() ?? "<anonymous>"
    const generics = cls.getTypeParameters().map((tp) => tp.getText())
    const extendsClause = cls.getExtends()?.getText() ?? ""
    const implementsClauses = cls.getImplements().map((i) => i.getText())

    let signature = `class ${name}`
    if (generics.length > 0) signature += `<${generics.join(", ")}>`
    if (extendsClause) signature += ` extends ${extendsClause}`
    if (implementsClauses.length > 0) signature += ` implements ${implementsClauses.join(", ")}`

    return {
      name,
      kind: "class" as SymbolKind,
      signature,
      startLine: cls.getStartLineNumber(),
      endLine: cls.getEndLineNumber(),
      fullSource: cls.getFullText().trim(),
      isExported: cls.isExported(),
      docComment: this.extractJsDoc(cls.getJsDocs()),
      generics: generics.length > 0 ? generics : undefined,
    }
  }

  private extractMethod(method: MethodDeclaration, parentName: string): RawSymbol {
    const name = method.getName()
    const isAsync = method.isAsync()
    const isStatic = method.isStatic()
    const accessModifier = method.getScope()

    const params = method
      .getParameters()
      .map((p) => p.getText())
      .join(", ")
    const returnType = method.getReturnTypeNode()?.getText() ?? ""
    const generics = method.getTypeParameters().map((tp) => tp.getText())

    let signature = ""
    if (accessModifier) signature += `${accessModifier} `
    if (isStatic) signature += "static "
    if (isAsync) signature += "async "
    signature += `${name}`
    if (generics.length > 0) signature += `<${generics.join(", ")}>`
    signature += `(${params})`
    if (returnType) signature += `: ${returnType}`

    return {
      name,
      kind: "method" as SymbolKind,
      signature,
      startLine: method.getStartLineNumber(),
      endLine: method.getEndLineNumber(),
      fullSource: method.getFullText().trim(),
      isExported: false,
      docComment: this.extractJsDoc(method.getJsDocs()),
      parentName,
      generics: generics.length > 0 ? generics : undefined,
    }
  }

  private extractFunction(fn: FunctionDeclaration): RawSymbol {
    const name = fn.getName() ?? "<anonymous>"
    const isAsync = fn.isAsync()
    const params = fn
      .getParameters()
      .map((p) => p.getText())
      .join(", ")
    const returnType = fn.getReturnTypeNode()?.getText() ?? ""
    const generics = fn.getTypeParameters().map((tp) => tp.getText())

    let signature = ""
    if (isAsync) signature += "async "
    signature += `function ${name}`
    if (generics.length > 0) signature += `<${generics.join(", ")}>`
    signature += `(${params})`
    if (returnType) signature += `: ${returnType}`

    return {
      name,
      kind: "function" as SymbolKind,
      signature,
      startLine: fn.getStartLineNumber(),
      endLine: fn.getEndLineNumber(),
      fullSource: fn.getFullText().trim(),
      isExported: fn.isExported(),
      docComment: this.extractJsDoc(fn.getJsDocs()),
      generics: generics.length > 0 ? generics : undefined,
    }
  }

  private extractInterface(iface: InterfaceDeclaration): RawSymbol {
    const name = iface.getName()
    const generics = iface.getTypeParameters().map((tp) => tp.getText())
    const extendsClause = iface.getExtends().map((e) => e.getText())

    let signature = `interface ${name}`
    if (generics.length > 0) signature += `<${generics.join(", ")}>`
    if (extendsClause.length > 0) signature += ` extends ${extendsClause.join(", ")}`

    return {
      name,
      kind: "interface" as SymbolKind,
      signature,
      startLine: iface.getStartLineNumber(),
      endLine: iface.getEndLineNumber(),
      fullSource: iface.getFullText().trim(),
      isExported: iface.isExported(),
      docComment: this.extractJsDoc(iface.getJsDocs()),
      generics: generics.length > 0 ? generics : undefined,
    }
  }

  private extractTypeAlias(typeAlias: TypeAliasDeclaration): RawSymbol {
    const name = typeAlias.getName()
    const generics = typeAlias.getTypeParameters().map((tp) => tp.getText())
    const typeText = typeAlias.getTypeNode()?.getText() ?? ""

    let signature = `type ${name}`
    if (generics.length > 0) signature += `<${generics.join(", ")}>`
    signature += ` = ${typeText}`

    return {
      name,
      kind: "type" as SymbolKind,
      signature,
      startLine: typeAlias.getStartLineNumber(),
      endLine: typeAlias.getEndLineNumber(),
      fullSource: typeAlias.getFullText().trim(),
      isExported: typeAlias.isExported(),
      docComment: this.extractJsDoc(typeAlias.getJsDocs()),
      generics: generics.length > 0 ? generics : undefined,
    }
  }

  private extractEnum(enumDecl: EnumDeclaration): RawSymbol {
    const name = enumDecl.getName()
    const members = enumDecl.getMembers().map((m) => m.getName())
    const signature = `enum ${name} { ${members.join(", ")} }`

    return {
      name,
      kind: "enum" as SymbolKind,
      signature,
      startLine: enumDecl.getStartLineNumber(),
      endLine: enumDecl.getEndLineNumber(),
      fullSource: enumDecl.getFullText().trim(),
      isExported: enumDecl.isExported(),
      docComment: this.extractJsDoc(enumDecl.getJsDocs()),
    }
  }

  private extractVariableStatement(varStatement: VariableStatement): RawSymbol[] {
    const symbols: RawSymbol[] = []
    const isConst =
      varStatement.getDeclarationKind() === VariableDeclarationKind.Const

    for (const decl of varStatement.getDeclarations()) {
      const name = decl.getName()
      const typeAnnotation = decl.getTypeNode()?.getText() ?? ""
      const kind: SymbolKind = isConst ? "constant" : "variable"

      let signature = isConst ? "const " : "let "
      signature += name
      if (typeAnnotation) signature += `: ${typeAnnotation}`

      symbols.push({
        name,
        kind,
        signature,
        startLine: varStatement.getStartLineNumber(),
        endLine: varStatement.getEndLineNumber(),
        fullSource: varStatement.getFullText().trim(),
        isExported: true,
      })
    }

    return symbols
  }

  private extractJsDoc(jsDocs: JSDoc[]): string | undefined {
    if (jsDocs.length === 0) return undefined
    return jsDocs
      .map((doc) => doc.getDescription().trim())
      .filter(Boolean)
      .join("\n") || undefined
  }
}

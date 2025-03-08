import { dirname, resolve } from "path";
import * as ts from "typescript";

export interface TypeCheckOptions {
  tsconfigPath?: string;
  projectRoot?: string;
}

/**
 * Validates TypeScript code and returns formatted error messages if there are any type errors
 * @returns Formatted error message if there are errors, undefined if valid
 */
export async function validateTypeScript(
  filePath: string,
  options: TypeCheckOptions,
): Promise<string | undefined> {
  const projectRoot = options.projectRoot ?? dirname(filePath);
  const tsconfigPath =
    options.tsconfigPath ?? resolve(projectRoot, "tsconfig.json");

  // Load tsconfig.json if it exists
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  };

  if (ts.sys.fileExists(tsconfigPath)) {
    const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (error) {
      throw new Error(`Error reading tsconfig.json: ${error.messageText}`);
    }

    const { options: parsedOptions, errors } = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      projectRoot,
    );

    if (errors.length) {
      throw new Error(
        `Error parsing tsconfig.json: ${errors.map((e) => e.messageText).join("\n")}`,
      );
    }

    compilerOptions = parsedOptions;
  }

  // Create program
  const program = ts.createProgram({
    rootNames: [filePath],
    options: compilerOptions,
  });

  // Get diagnostics
  const diagnostics = [
    ...program.getSemanticDiagnostics(),
    ...program.getSyntacticDiagnostics(),
  ];

  if (diagnostics.length > 0) {
    return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (path) => path,
      getCurrentDirectory: () => projectRoot,
      getNewLine: () => ts.sys.newLine,
    });
  }

  return undefined;
}

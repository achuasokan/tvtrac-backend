import js from "@eslint/js";
import tselint from "typescript-eslint"


export default [
    js.configs.recommended,
    ...tselint.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.json"
            }
        },
        rules: {
            "no-console": "warn",
            "@typescript-eslint/no-unused-vars": [
             "warn",
        {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_"
        }
            ],
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/consistent-type-imports": "warn",
            
        }
    }
]
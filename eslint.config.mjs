// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: { allowDefaultProject: ['webpack.config.mjs', 'eslint.config.mjs', 'jest.config.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            eqeqeq: 'error',
        },
    }
);

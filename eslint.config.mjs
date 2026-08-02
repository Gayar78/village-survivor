import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.config.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    /**
     * Garde de déterminisme du cœur de simulation.
     *
     * La coopération est un lockstep : tous les pairs doivent obtenir des résultats identiques
     * au bit près. Or ECMAScript ne spécifie exactement que les opérateurs arithmétiques,
     * `Math.sqrt`, `Math.round` et consorts ; les fonctions transcendantes et l'opérateur de
     * puissance sont « approximés par l'implémentation ».
     *
     * Mesuré le 1er août 2026 : `Math.cos`, `Math.sin` et `Math.atan2` donnent trois résultats
     * différents sur trois navigateurs, y compris entre deux versions du même moteur. Une
     * partie coopérative divergeait après moins de deux minutes.
     *
     * Les remplacements déterministes vivent dans `packages/game-core/src/exact-math.ts`.
     */
    files: ['packages/game-core/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
          'cos',
          'sin',
          'tan',
          'acos',
          'asin',
          'atan',
          'atan2',
          'hypot',
          'pow',
          'exp',
          'expm1',
          'log',
          'log1p',
          'log2',
          'log10',
          'cbrt',
          'sinh',
          'cosh',
          'tanh',
          'asinh',
          'acosh',
          'atanh',
          'fround',
        ].map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} est approximé par l'implémentation : son résultat varie d'un navigateur à l'autre et casse le lockstep. Utiliser packages/game-core/src/exact-math.ts.`,
        })),
        {
          object: 'Math',
          property: 'random',
          message:
            'Aléatoire non reproductible : utiliser SeededRandom, alimenté par la graine de la partie.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            "Le cœur de simulation ne lit jamais l'horloge : le temps avance par ticks de durée fixe.",
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message:
            "L'opérateur de puissance est approximé par l'implémentation. Pour un exposant entier, multiplier explicitement.",
        },
        {
          selector: "MemberExpression[object.name='performance']",
          message:
            "Le cœur de simulation ne lit jamais l'horloge : le temps avance par ticks de durée fixe.",
        },
      ],
      /**
       * Le moteur ne connaît pas la télémétrie. Une bibliothèque qui horodate, mesure et appelle
       * le réseau introduirait exactement ce que le lockstep interdit. La mesure entoure `step()`
       * depuis la couche client, sans que `step()` ne sache qu'il est mesuré.
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@opentelemetry/*'],
              message:
                "Le cœur de simulation reste hors de portée de l'instrumentation : mesurer depuis apps/client, jamais depuis game-core.",
            },
          ],
        },
      ],
    },
  },
  {
    // Scripts d'exploitation du déploiement LAN : ils s'exécutent dans Node, pas dans le
    // navigateur, et écrivent volontairement sur la sortie standard.
    files: ['deploy/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        WebSocket: 'readonly',
      },
    },
  },
);

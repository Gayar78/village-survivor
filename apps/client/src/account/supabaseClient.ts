import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Vrai uniquement si les deux clés Supabase sont renseignées dans le `.env`.
 * L'application s'appuie dessus pour afficher un message d'aide plutôt qu'une
 * page blanche tant que la configuration n'est pas faite.
 */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

// En l'absence de configuration, on instancie tout de même le client sur des
// valeurs neutres (mais syntaxiquement valides) pour éviter que l'import ne lève
// une erreur — ce qui donnerait une page blanche. Aucun appel réseau n'est fait
// dans ce cas : `main.ts` détecte `isSupabaseConfigured === false` en amont.
export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? anonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

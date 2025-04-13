// 環境変数確認用
require('dotenv').config({ path: '.env.local' });

console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE set:', !!process.env.SUPABASE_SERVICE_ROLE);
console.log('NEXT_PUBLIC_OPENAI_API_KEY set:', !!process.env.NEXT_PUBLIC_OPENAI_API_KEY); 
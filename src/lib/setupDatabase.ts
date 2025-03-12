import { supabase } from './supabaseClient';

// データベースのセットアップを行う関数
export async function setupDatabase() {
  console.log("データベースのセットアップを開始します");
  
  try {
    // departmentsテーブルの存在確認
    const { data: existingTables, error: tableError } = await supabase
      .from('departments')
      .select('count()')
      .limit(1);
    
    if (tableError) {
      console.log("departmentsテーブルが存在しないか、アクセスできません:", tableError.message);
      console.log("departmentsテーブルの作成を試みます");
      
      // SQL実行は通常のSupabaseクライアントではできないため、
      // 代わりにREST APIを使用してデータを挿入します
      
      // ダミーデータの作成
      const dummyDepartments = [
        { id: "1", name: "内科", facility_id: "system" },
        { id: "2", name: "外科", facility_id: "system" },
        { id: "3", name: "小児科", facility_id: "system" },
        { id: "4", name: "産婦人科", facility_id: "system" },
        { id: "5", name: "整形外科", facility_id: "system" },
        { id: "6", name: "眼科", facility_id: "system" },
        { id: "7", name: "耳鼻咽喉科", facility_id: "system" },
        { id: "8", name: "皮膚科", facility_id: "system" },
        { id: "9", name: "泌尿器科", facility_id: "system" },
        { id: "10", name: "精神科", facility_id: "system" }
      ];
      
      // データの挿入
      const { data, error } = await supabase
        .from('departments')
        .insert(dummyDepartments)
        .select();
      
      if (error) {
        console.error("ダミー部署データの挿入に失敗しました:", error.message, error.details);
      } else {
        console.log("ダミー部署データを挿入しました:", data);
      }
    } else {
      console.log("departmentsテーブルは既に存在します:", existingTables);
    }
    
    return { success: true };
  } catch (error) {
    console.error("データベースセットアップ中にエラーが発生しました:", error);
    return { success: false, error };
  }
}

// ローカルストレージに部署データを保存する関数
export function saveDepartmentsToLocalStorage(departments: any[]) {
  try {
    localStorage.setItem('departments', JSON.stringify(departments));
    console.log("部署データをローカルストレージに保存しました");
    return true;
  } catch (error) {
    console.error("部署データのローカルストレージへの保存に失敗しました:", error);
    return false;
  }
}

// ローカルストレージから部署データを取得する関数
export function getDepartmentsFromLocalStorage() {
  try {
    const data = localStorage.getItem('departments');
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error("ローカルストレージからの部署データ取得に失敗しました:", error);
    return null;
  }
} 
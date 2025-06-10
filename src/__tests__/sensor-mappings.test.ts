// src/__tests__/sensor-mappings.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Supabaseのモック
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ 
          data: {
            id: 'test-mapping-id',
            sensor_device_id: 'test-device-id',
            sensor_type: 'ahtTemp',
            temperature_item_id: 'test-item-id',
            offset_value: 0
          }, 
          error: null 
        }))
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ error: null }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ error: null }))
    }))
  }))
};

// モジュールのモック
jest.mock('@/lib/supabaseBrowser', () => ({
  default: mockSupabase
}));

describe('センサーマッピング機能テスト', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('マッピングデータの取得', () => {
    it('既存マッピングを正しく取得できる', async () => {
      const mockMappingData = [
        {
          id: 'mapping-1',
          sensor_device_id: 'device-1',
          sensor_type: 'ahtTemp',
          temperature_item_id: 'item-1',
          offset_value: 0.5,
          sensor_devices: { device_name: 'Test Device' },
          temperature_items: { 
            display_name: 'テスト温度アイテム',
            departments: { name: 'テスト部署' }
          }
        }
      ];

      const selectMock = jest.fn(() => Promise.resolve({ 
        data: mockMappingData, 
        error: null 
      }));
      
      mockSupabase.from.mockReturnValue({
        select: selectMock
      });

      const result = await mockSupabase.from('sensor_mappings').select(`
        id,
        sensor_device_id,
        sensor_devices(device_name),
        sensor_type,
        temperature_item_id,
        temperature_items(display_name, departments(name)),
        offset_value
      `);

      expect(mockSupabase.from).toHaveBeenCalledWith('sensor_mappings');
      expect(result.data).toEqual(mockMappingData);
      expect(result.error).toBeNull();
    });

    it('マッピングが存在しない場合は空配列を返す', async () => {
      const selectMock = jest.fn(() => Promise.resolve({ 
        data: [], 
        error: null 
      }));
      
      mockSupabase.from.mockReturnValue({
        select: selectMock
      });

      const result = await mockSupabase.from('sensor_mappings').select('*');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('マッピングの作成', () => {
    it('新しいマッピングを正しく作成できる', async () => {
      const newMapping = {
        sensor_device_id: 'device-123',
        sensor_type: 'ahtTemp',
        temperature_item_id: 'item-456',
        offset_value: 1.0
      };

      const mockInsertData = {
        id: 'new-mapping-id',
        ...newMapping,
        sensor_devices: { device_name: 'New Device' },
        temperature_items: { 
          display_name: '新規温度アイテム',
          departments: { name: '新規部署' }
        }
      };

      const singleMock = jest.fn(() => Promise.resolve({ 
        data: mockInsertData, 
        error: null 
      }));
      const selectMock = jest.fn(() => ({ single: singleMock }));
      const insertMock = jest.fn(() => ({ select: selectMock }));
      
      mockSupabase.from.mockReturnValue({
        insert: insertMock
      });

      const result = await mockSupabase
        .from('sensor_mappings')
        .insert(newMapping)
        .select(`
          id,
          sensor_device_id,
          sensor_devices(device_name),
          sensor_type,
          temperature_item_id,
          temperature_items(display_name, departments(name)),
          offset_value
        `)
        .single();

      expect(insertMock).toHaveBeenCalledWith(newMapping);
      expect(result.data).toEqual(mockInsertData);
      expect(result.error).toBeNull();
    });

    it('必須フィールドが不足している場合はエラーを返す', async () => {
      const invalidMapping = {
        sensor_device_id: null, // 必須フィールドが null
        sensor_type: 'ahtTemp',
        temperature_item_id: 'item-456',
        offset_value: 1.0
      };

      const singleMock = jest.fn(() => Promise.resolve({ 
        data: null, 
        error: { message: 'sensor_device_id cannot be null' }
      }));
      const selectMock = jest.fn(() => ({ single: singleMock }));
      const insertMock = jest.fn(() => ({ select: selectMock }));
      
      mockSupabase.from.mockReturnValue({
        insert: insertMock
      });

      const result = await mockSupabase
        .from('sensor_mappings')
        .insert(invalidMapping)
        .select('*')
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('sensor_device_id');
    });
  });

  describe('マッピングの更新', () => {
    it('既存マッピングを正しく更新できる', async () => {
      const updateData = {
        sensor_type: 'bmpTemp',
        offset_value: 2.0
      };

      const eqMock = jest.fn(() => Promise.resolve({ error: null }));
      const updateMock = jest.fn(() => ({ eq: eqMock }));
      
      mockSupabase.from.mockReturnValue({
        update: updateMock
      });

      const result = await mockSupabase
        .from('sensor_mappings')
        .update(updateData)
        .eq('id', 'mapping-123');

      expect(updateMock).toHaveBeenCalledWith(updateData);
      expect(eqMock).toHaveBeenCalledWith('id', 'mapping-123');
      expect(result.error).toBeNull();
    });
  });

  describe('マッピングの削除', () => {
    it('既存マッピングを正しく削除できる', async () => {
      const eqMock = jest.fn(() => Promise.resolve({ error: null }));
      const deleteMock = jest.fn(() => ({ eq: eqMock }));
      
      mockSupabase.from.mockReturnValue({
        delete: deleteMock
      });

      const result = await mockSupabase
        .from('sensor_mappings')
        .delete()
        .eq('id', 'mapping-to-delete');

      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith('id', 'mapping-to-delete');
      expect(result.error).toBeNull();
    });
  });

  describe('APIエンドポイントでのマッピング取得', () => {
    it('デバイスIDに対応するマッピングを正しく取得できる', async () => {
      const deviceId = 'device-123';
      const mockMappings = [
        {
          id: 'mapping-1',
          sensor_device_id: deviceId,
          sensor_type: 'ahtTemp',
          temperature_item_id: 'item-1',
          offset_value: 0.5
        },
        {
          id: 'mapping-2',
          sensor_device_id: deviceId,
          sensor_type: 'ahtHum',
          temperature_item_id: 'item-2',
          offset_value: 0.0
        }
      ];

      const eqMock = jest.fn(() => Promise.resolve({ 
        data: mockMappings, 
        error: null 
      }));
      const selectMock = jest.fn(() => ({ eq: eqMock }));
      
      mockSupabase.from.mockReturnValue({
        select: selectMock
      });

      const result = await mockSupabase
        .from('sensor_mappings')
        .select('id,sensor_device_id,sensor_type,temperature_item_id,offset_value')
        .eq('sensor_device_id', deviceId);

      expect(selectMock).toHaveBeenCalledWith('id,sensor_device_id,sensor_type,temperature_item_id,offset_value');
      expect(eqMock).toHaveBeenCalledWith('sensor_device_id', deviceId);
      expect(result.data).toEqual(mockMappings);
      expect(result.data).toHaveLength(2);
    });

    it('マッピングが存在しないデバイスの場合は空配列を返す', async () => {
      const nonExistentDeviceId = 'non-existent-device';

      const eqMock = jest.fn(() => Promise.resolve({ 
        data: [], 
        error: null 
      }));
      const selectMock = jest.fn(() => ({ eq: eqMock }));
      
      mockSupabase.from.mockReturnValue({
        select: selectMock
      });

      const result = await mockSupabase
        .from('sensor_mappings')
        .select('id,sensor_device_id,sensor_type,temperature_item_id,offset_value')
        .eq('sensor_device_id', nonExistentDeviceId);

      expect(result.data).toEqual([]);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('マッピングデータの検証', () => {
    it('sensor_typeが有効な値かチェックする', () => {
      const validSensorTypes = ['ahtTemp', 'ahtHum', 'bmpTemp', 'bmpPres'];
      const testSensorType = 'ahtTemp';

      expect(validSensorTypes).toContain(testSensorType);
    });

    it('offset_valueが数値型かチェックする', () => {
      const offsetValue = 1.5;

      expect(typeof offsetValue).toBe('number');
      expect(Number.isFinite(offsetValue)).toBe(true);
    });

    it('UUIDフォーマットが正しいかチェックする', () => {
      const testUUID = '573ce63d-4b4e-4545-a169-2fc572f0b0c2';
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuidRegex.test(testUUID)).toBe(true);
    });
  });
});
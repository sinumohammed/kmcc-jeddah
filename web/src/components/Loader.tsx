import { Spin } from 'antd';

export function Loader({ minHeight = 320 }: { minHeight?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight,
        width: '100%',
      }}
    >
      <Spin size="large" />
    </div>
  );
}

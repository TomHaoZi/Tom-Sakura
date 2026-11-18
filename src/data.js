// Test media is deliberately separate from the live anime catalog.
export const testItem = {
  id: 'player-test', title: '播放器连通性测试', en: 'PUBLIC PLAYER TEST',
  image: '', score: null, year: '', country: '', type: '播放器测试',
  episodes: 1, status: '公开测试素材', subtitle: '验证网络、解码与播放控制。',
  description: '这是公开的播放器测试素材，用于验证网络、视频解码和自动切换，不属于任何番剧正片。测试不会写入观看记录。',
  color: '#9b7d91', remote: false,
};
export const demoSources = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
];

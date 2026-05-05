export const formatDateChinese = (dateString: string) => {
  if (!dateString) return '未定';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'short' });
  
  return `${y}年${m}月${d}日 ${weekday}`;
};

export const formatMonthDay = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  
  return `${m}月${d}日`;
};

export const formatFullDateChinese = (dateString: string) => {
  if (!dateString) return '未定';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
};

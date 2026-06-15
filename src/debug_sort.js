const list = [
  '골지스카프kt',
  '나시투인원',
  '단가라v캡kt',
  '땡땡언발kt',
  '라운드에스닉KT',
  '럭키포니Y',
  '롱끈ns',
  'BA0520-05',
  'BA0522-01',
  'BC0601-08',
  'ST투인원KT',
  'VT투인원kt'
];

const sortDirection = 'asc';

const isKoreanStart = (str) => /^[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(str);

const sorted = [...list].sort((valA, valB) => {
  const strA = valA === undefined || valA === null ? '' : String(valA).trim();
  const strB = valB === undefined || valB === null ? '' : String(valB).trim();

  // 빈 값 처리
  if (strA === '' && strB !== '') return 1;
  if (strA !== '' && strB === '') return -1;
  if (strA === '' && strB === '') return 0;

  const isA_Kor = isKoreanStart(strA);
  const isB_Kor = isKoreanStart(strB);

  let compareResult = 0;
  if (isA_Kor !== isB_Kor) {
    compareResult = isA_Kor ? 1 : -1;
  } else {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    compareResult = collator.compare(strA, strB);
  }
  
  return sortDirection === 'asc' ? compareResult : -compareResult;
});

console.log('Original:', list);
console.log('Sorted (asc):', sorted);

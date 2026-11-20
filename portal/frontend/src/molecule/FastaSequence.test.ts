import { parseFasta } from './FastaSequence';

test('reads one record', () => {
  expect(parseFasta('>mol9\nGGACGU\n')).toEqual([{ header: 'mol9', sequence: 'GGACGU' }]);
});

test('joins a sequence wrapped over several lines, with Windows line endings', () => {
  expect(parseFasta('>mol9 designed\r\nGGAC\r\nGUUU\r\n\r\n')).toEqual([{ header: 'mol9 designed', sequence: 'GGACGUUU' }]);
});

test('reads every record of a file', () => {
  expect(parseFasta('>a\nGG\n>b\nCC\nUU\n')).toEqual([
    { header: 'a', sequence: 'GG' },
    { header: 'b', sequence: 'CCUU' }
  ]);
});

test('reads a sequence with no header line', () => {
  expect(parseFasta('GGAC\n')).toEqual([{ header: '', sequence: 'GGAC' }]);
});

test('skips ; comment lines', () => {
  expect(parseFasta('>a\n;a comment\nGGAC\n')).toEqual([{ header: 'a', sequence: 'GGAC' }]);
});

test('drops spaces inside a line and the * that ends a sequence, but keeps a * inside one', () => {
  expect(parseFasta('>a\nGGAC GUUU\nAC*\n')).toEqual([{ header: 'a', sequence: 'GGACGUUUAC' }]);
  expect(parseFasta('>a\nGG*AC\n')).toEqual([{ header: 'a', sequence: 'GG*AC' }]);
});

test('drops a header with no sequence', () => {
  expect(parseFasta('>empty\n>b\nCC\n')).toEqual([{ header: 'b', sequence: 'CC' }]);
  expect(parseFasta('')).toEqual([]);
});

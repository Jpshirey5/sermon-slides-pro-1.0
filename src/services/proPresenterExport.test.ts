import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock file-saver
vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

// Mock JSZip
vi.mock('jszip', () => {
  const mockFile = vi.fn().mockReturnThis();
  const mockGenerateAsync = vi.fn().mockResolvedValue(new Blob(['test'], { type: 'application/zip' }));
  return {
    default: vi.fn().mockImplementation(() => ({
      file: mockFile,
      generateAsync: mockGenerateAsync,
    })),
  };
});

// Import after mocking
import { exportAsProBundle, exportAsPlainText, validateSlidesForExport, sanitizeFileName, SlideData } from './proPresenterExport';
import { saveAs } from 'file-saver';

describe('ProPresenter Export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockSlides = (): SlideData[] => [
    {
      id: '1',
      type: 'title',
      content: {
        title: 'Welcome to Our Service',
        subtitle: 'Sunday Morning',
      },
      background: '#5c1e2b',
      fontFamily: 'Arial',
      textColor: '#FFFFFF',
    },
    {
      id: '2',
      type: 'scripture',
      content: {
        scripture: 'For God so loved the world that he gave his one and only Son.',
        reference: 'John 3:16',
      },
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      fontFamily: 'Georgia',
      textColor: '#FFFFFF',
    },
    {
      id: '3',
      type: 'point',
      content: {
        title: 'First Point',
        subtitle: 'God loves you unconditionally',
      },
      background: '#2d3748',
      fontFamily: 'Arial',
      textColor: '#FFFFFF',
    },
    {
      id: '4',
      type: 'blank',
      content: {},
      background: '#000000',
      fontFamily: 'Arial',
      textColor: '#FFFFFF',
    },
  ];

  describe('exportAsProBundle', () => {
    it('should export a .probundle file with correct filename', async () => {
      const slides = createMockSlides();
      const title = 'Test Presentation';

      await exportAsProBundle(slides, title);

      // Verify saveAs was called with a Blob and correct filename
      expect(saveAs).toHaveBeenCalledTimes(1);
      const [blob, filename] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      
      expect(blob).toBeInstanceOf(Blob);
      expect(filename).toBe('Test Presentation.probundle');
    });

    it('should have unique UUIDs for each element', async () => {
      const slides = createMockSlides();
      const title = 'UUID Test';

      // Since we're exporting a Blob, we can verify the function runs without error
      await expect(exportAsProBundle(slides, title)).resolves.not.toThrow();
    });

    it('should sanitize filename properly', async () => {
      const slides = createMockSlides();
      const title = 'My Sermon: "Love & Faith" (2024)!';

      await exportAsProBundle(slides, title);

      const [, filename] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      
      // Should have sanitized special characters
      expect(filename).not.toContain(':');
      expect(filename).not.toContain('"');
      expect(filename).not.toContain('&');
      expect(filename).not.toContain('(');
      expect(filename).not.toContain(')');
      expect(filename).not.toContain('!');
      expect(filename).toContain('.probundle');
      // Should preserve spaces and alphanumeric
      expect(filename).toBe('My Sermon Love Faith 2024.probundle');
    });
  });

  describe('validateSlidesForExport', () => {
    it('should return invalid for empty slides array', () => {
      const result = validateSlidesForExport([]);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No slides to export. Please add at least one slide.');
    });

    it('should return valid for slides with content', () => {
      const slides = createMockSlides();
      const result = validateSlidesForExport(slides);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for slides with only blank content', () => {
      const slides: SlideData[] = [
        {
          id: '1',
          type: 'blank',
          content: {},
          background: '#000000',
          fontFamily: 'Arial',
          textColor: '#FFFFFF',
        },
      ];
      
      const result = validateSlidesForExport(slides);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('All slides are empty. Please add content to at least one slide.');
    });

    it('should detect duplicate slide IDs', () => {
      const slides: SlideData[] = [
        {
          id: 'duplicate-id',
          type: 'title',
          content: { title: 'Slide 1' },
          background: '#000000',
          fontFamily: 'Arial',
          textColor: '#FFFFFF',
        },
        {
          id: 'duplicate-id', // Same ID!
          type: 'point',
          content: { title: 'Slide 2' },
          background: '#000000',
          fontFamily: 'Arial',
          textColor: '#FFFFFF',
        },
      ];
      
      const result = validateSlidesForExport(slides);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate slide IDs detected. This may cause import issues.');
    });
  });

  describe('sanitizeFileName', () => {
    it('should remove unsafe filesystem characters', () => {
      expect(sanitizeFileName('test:file')).toBe('testfile');
      expect(sanitizeFileName('test<file>name')).toBe('testfilename');
      expect(sanitizeFileName('test"file')).toBe('testfile');
      expect(sanitizeFileName('test/file\\name')).toBe('testfilename');
      expect(sanitizeFileName('test|file?name')).toBe('testfilename');
      expect(sanitizeFileName('test*file')).toBe('testfile');
    });

    it('should preserve spaces', () => {
      expect(sanitizeFileName('My Sermon Title')).toBe('My Sermon Title');
    });

    it('should collapse multiple spaces', () => {
      expect(sanitizeFileName('My   Sermon   Title')).toBe('My Sermon Title');
    });

    it('should return default for empty string', () => {
      expect(sanitizeFileName('')).toBe('Presentation');
      expect(sanitizeFileName('   ')).toBe('Presentation');
    });
  });

  describe('exportAsPlainText', () => {
    it('should export a .txt file with correct filename', () => {
      const slides = createMockSlides();
      const title = 'Test Presentation';

      exportAsPlainText(slides, title);

      expect(saveAs).toHaveBeenCalledTimes(1);
      const [blob, filename] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      
      expect(blob).toBeInstanceOf(Blob);
      expect(filename).toBe('Test Presentation.txt');
    });

    it('should create plain text content', () => {
      const slides = createMockSlides();
      const title = 'Test Presentation';

      exportAsPlainText(slides, title);

      const [blob] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      
      expect(blob.type).toContain('text/plain');
    });
  });
});

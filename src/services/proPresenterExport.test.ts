import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

// Mock file-saver
vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

// Import after mocking
import { exportAsProBundle, SlideData } from './proPresenterExport';
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

  it('should export a .probundle file with correct structure', async () => {
    const slides = createMockSlides();
    const title = 'Test Presentation';

    await exportAsProBundle(slides, title);

    // Verify saveAs was called with a Blob and correct filename
    expect(saveAs).toHaveBeenCalledTimes(1);
    const [blob, filename] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe('Test Presentation.probundle');
  });

  it('should include a valid .pro6 XML file at ZIP root', async () => {
    const slides = createMockSlides();
    const title = 'My Sermon';

    await exportAsProBundle(slides, title);

    const [blob] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    
    // Load the ZIP and verify structure
    const zip = await JSZip.loadAsync(blob);
    
    // Check .pro6 file exists at root
    const pro6File = zip.file('My Sermon.pro6');
    expect(pro6File).not.toBeNull();
    
    // Verify XML content
    const xmlContent = await pro6File!.async('string');
    
    // Check XML declaration
    expect(xmlContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    
    // Check document structure
    expect(xmlContent).toContain('<RVPresentationDocument');
    expect(xmlContent).toContain('height="1080" width="1920"');
    expect(xmlContent).toContain('versionNumber="600"');
  });

  it('should contain all slides in correct structure', async () => {
    const slides = createMockSlides();
    const title = 'Slide Test';

    await exportAsProBundle(slides, title);

    const [blob] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const zip = await JSZip.loadAsync(blob);
    const pro6File = zip.file('Slide Test.pro6');
    const xmlContent = await pro6File!.async('string');

    // Check slide grouping structure
    expect(xmlContent).toContain('<groups containerClass="NSMutableArray">');
    expect(xmlContent).toContain('<RVSlideGrouping name="Slide Test"');
    expect(xmlContent).toContain('<slides containerClass="NSMutableArray">');
    
    // Check each slide has required elements
    expect(xmlContent).toContain('<RVDisplaySlide');
    expect(xmlContent).toContain('<RVTextElement');
    expect(xmlContent).toContain('RTFData="');
    expect(xmlContent).toContain('<_-RVRect3D-_position');
    
    // Check slide labels
    expect(xmlContent).toContain('label="Welcome to Our Service"');
    expect(xmlContent).toContain('label="John 3:16"');
    expect(xmlContent).toContain('label="First Point"');
  });

  it('should have unique UUIDs for each slide', async () => {
    const slides = createMockSlides();
    const title = 'UUID Test';

    await exportAsProBundle(slides, title);

    const [blob] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const zip = await JSZip.loadAsync(blob);
    const pro6File = zip.file('UUID Test.pro6');
    const xmlContent = await pro6File!.async('string');

    // Extract all UUIDs from the XML
    const uuidMatches = xmlContent.match(/UUID="([A-Fa-f0-9-]+)"/g) || [];
    const uuids = uuidMatches.map(m => m.match(/UUID="([^"]+)"/)?.[1]);
    
    // All UUIDs should be unique
    const uniqueUuids = new Set(uuids);
    expect(uniqueUuids.size).toBe(uuids.length);
    
    // Should have at least: presentation + group + 4 slides + text elements = 9+ UUIDs
    expect(uuids.length).toBeGreaterThanOrEqual(9);
  });

  it('should properly encode RTF data as base64', async () => {
    const slides = createMockSlides();
    const title = 'RTF Test';

    await exportAsProBundle(slides, title);

    const [blob] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const zip = await JSZip.loadAsync(blob);
    const pro6File = zip.file('RTF Test.pro6');
    const xmlContent = await pro6File!.async('string');

    // Extract RTFData values
    const rtfMatches = xmlContent.match(/RTFData="([^"]+)"/g) || [];
    expect(rtfMatches.length).toBeGreaterThan(0);

    // Verify each RTFData is valid base64 and decodes to RTF
    for (const match of rtfMatches) {
      const base64 = match.match(/RTFData="([^"]+)"/)?.[1];
      if (base64 && base64.length > 0) {
        // Should be valid base64 (no throw on decode)
        const decoded = decodeURIComponent(escape(atob(base64)));
        expect(decoded).toContain('{\\rtf1');
        expect(decoded).toContain('\\fonttbl');
      }
    }
  });

  it('should include media folder in ZIP', async () => {
    const slides = createMockSlides();
    const title = 'Media Test';

    await exportAsProBundle(slides, title);

    const [blob] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const zip = await JSZip.loadAsync(blob);
    
    // Check media folder exists
    const mediaFolder = zip.folder('media');
    expect(mediaFolder).not.toBeNull();
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

  it('should handle empty slides array', async () => {
    const slides: SlideData[] = [];
    const title = 'Empty Presentation';

    await exportAsProBundle(slides, title);

    const [blob, filename] = (saveAs as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe('Empty Presentation.probundle');
    
    // Verify ZIP still has valid structure
    const zip = await JSZip.loadAsync(blob);
    const pro6File = zip.file('Empty Presentation.pro6');
    expect(pro6File).not.toBeNull();
  });
});

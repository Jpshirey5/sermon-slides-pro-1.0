import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Image, Upload, Palette, Check } from 'lucide-react';

interface BackgroundPickerProps {
  currentBackground: string;
  currentBackgroundImage?: string;
  onBackgroundChange: (background: string, backgroundImage?: string) => void;
}

const gradientPresets = [
  { name: 'Burgundy', value: 'linear-gradient(135deg, #5c1e2b 0%, #3d1219 100%)' },
  { name: 'Deep Blue', value: 'linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)' },
  { name: 'Forest', value: 'linear-gradient(135deg, #1e4d2b 0%, #0d261a 100%)' },
  { name: 'Royal Purple', value: 'linear-gradient(135deg, #4a1e5c 0%, #2d1239 100%)' },
  { name: 'Warm Gold', value: 'linear-gradient(135deg, #5c4a1e 0%, #3d3012 100%)' },
  { name: 'Ocean', value: 'linear-gradient(135deg, #1e4d5c 0%, #0d2a39 100%)' },
  { name: 'Sunset', value: 'linear-gradient(135deg, #ff6b35 0%, #f7c59f 100%)' },
  { name: 'Midnight', value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
  { name: 'Rose', value: 'linear-gradient(135deg, #5c1e4d 0%, #3d1232 100%)' },
  { name: 'Charcoal', value: 'linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%)' },
  { name: 'Sky', value: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)' },
  { name: 'Earth', value: 'linear-gradient(135deg, #8b7355 0%, #5d4e37 100%)' },
];

const solidColors = [
  '#1a1a2e', '#16213e', '#0f3460', '#e94560',
  '#1b262c', '#0f4c75', '#3282b8', '#bbe1fa',
  '#2d132c', '#801336', '#c72c41', '#ee4540',
  '#1a1a1a', '#2d2d2d', '#404040', '#595959',
  '#5c1e2b', '#3d1219', '#8b0000', '#b22222',
  '#d4af37', '#c9a227', '#ffd700', '#ffb347',
  '#ffffff', '#f5f5f5', '#e5e5e5', '#d4d4d4',
];

const stockBackgrounds = [
  { name: 'Church Interior', url: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=1920&q=80' },
  { name: 'Bible Study', url: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=1920&q=80' },
  { name: 'Sunrise', url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1920&q=80' },
  { name: 'Mountains', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80' },
  { name: 'Ocean Sunset', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80' },
  { name: 'Forest Path', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80' },
  { name: 'Starry Night', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80' },
  { name: 'Cross Silhouette', url: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1920&q=80' },
];

export function BackgroundPicker({
  currentBackground,
  currentBackgroundImage,
  onBackgroundChange,
}: BackgroundPickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState('gradients');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        onBackgroundChange(currentBackground, dataUrl);
        setOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGradientSelect = (gradient: string) => {
    onBackgroundChange(gradient, undefined);
    setOpen(false);
  };

  const handleColorSelect = (color: string) => {
    onBackgroundChange(color, undefined);
    setOpen(false);
  };

  const handleImageSelect = (url: string) => {
    onBackgroundChange(currentBackground, url);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Image className="w-4 h-4" />
          Background
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Choose Background</DialogTitle>
        </DialogHeader>
        
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="gradients">
              <Palette className="w-4 h-4 mr-2" />
              Gradients
            </TabsTrigger>
            <TabsTrigger value="colors">
              <div className="w-4 h-4 mr-2 rounded bg-gradient-to-r from-red-500 via-green-500 to-blue-500" />
              Colors
            </TabsTrigger>
            <TabsTrigger value="images">
              <Image className="w-4 h-4 mr-2" />
              Images
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gradients" className="mt-4">
            <div className="grid grid-cols-4 gap-3">
              {gradientPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleGradientSelect(preset.value)}
                  className="relative aspect-video rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-colors group"
                  style={{ background: preset.value }}
                >
                  {currentBackground === preset.value && !currentBackgroundImage && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Check className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 right-1 text-xs text-white text-center font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="colors" className="mt-4">
            <div className="grid grid-cols-7 gap-2">
              {solidColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-colors"
                  style={{ background: color }}
                >
                  {currentBackground === color && !currentBackgroundImage && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="images" className="mt-4">
            <div className="grid grid-cols-4 gap-3">
              {stockBackgrounds.map((bg) => (
                <button
                  key={bg.name}
                  onClick={() => handleImageSelect(bg.url)}
                  className="relative aspect-video rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-colors group"
                >
                  <img
                    src={bg.url}
                    alt={bg.name}
                    className="w-full h-full object-cover"
                  />
                  {currentBackgroundImage === bg.url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Check className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 right-1 text-xs text-white text-center font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded px-1">
                    {bg.name}
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-foreground font-medium mb-2">
                Click to upload an image
              </p>
              <p className="text-sm text-muted-foreground">
                PNG, JPG up to 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

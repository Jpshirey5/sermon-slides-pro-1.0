import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { lookupScripture, searchScripture, ScriptureResult } from '@/lib/scripture-api';
import { Search, BookOpen, Loader2, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ScriptureLookupProps {
  reference: string;
  translation: string;
  onScriptureFound: (text: string, reference: string) => void;
}

export function ScriptureLookup({
  reference,
  translation,
  onScriptureFound,
}: ScriptureLookupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScriptureResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (reference.length > 2) {
      const matches = searchScripture(reference);
      setSuggestions(matches.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  }, [reference]);

  const handleLookup = async () => {
    if (!reference.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const scriptureResult = await lookupScripture(reference, translation);
      if (scriptureResult) {
        if (scriptureResult.error) {
          setError(scriptureResult.errorMessage || 'Could not find scripture. Check the reference format.');
        } else {
          setResult(scriptureResult);
        }
      } else {
        setError('Could not find scripture. Check the reference format.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseScripture = () => {
    if (result) {
      onScriptureFound(result.text, `${result.reference} (${result.translation})`);
      setResult(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Popover open={showSuggestions && suggestions.length > 0} onOpenChange={setShowSuggestions}>
          <PopoverTrigger asChild>
            <div className="relative flex-1">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="e.g., John 3:16"
                value={reference}
                className="pl-10"
                onFocus={() => setShowSuggestions(true)}
                readOnly
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground px-2 py-1">Suggestions</p>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
                  onClick={() => {
                    onScriptureFound('', suggestion);
                    setShowSuggestions(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLookup}
          disabled={isLoading || !reference.trim()}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Lookup
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {result && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground mb-1">
              {result.reference} ({result.translation})
            </p>
            {result.substituted && result.errorMessage && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                ⚠ {result.errorMessage}
              </p>
            )}
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              "{result.text}"
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleUseScripture}
          >
            <Check className="w-4 h-4" />
            Use This Scripture
          </Button>
        </div>
      )}
    </div>
  );
}

// Inline lookup button for the sermon creation form
export function ScriptureLookupButton({
  reference,
  translation,
  onScriptureFound,
}: ScriptureLookupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ScriptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!reference.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const scriptureResult = await lookupScripture(reference, translation);
      if (scriptureResult) {
        if (scriptureResult.error) {
          setError(scriptureResult.errorMessage || 'Could not find scripture');
        } else {
          setResult(scriptureResult);
        }
      } else {
        setError('Could not find scripture');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUse = () => {
    if (result) {
      onScriptureFound(result.text, `${result.reference} (${result.translation})`);
      setIsOpen(false);
      setResult(null);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={!reference.trim()}
          onClick={() => {
            setIsOpen(true);
            handleLookup();
          }}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Looking up scripture...</span>
          </div>
        )}
        
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {result && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">
                {result.reference} ({result.translation})
              </p>
              {result.substituted && result.errorMessage && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                  ⚠ {result.errorMessage}
                </p>
              )}
              <p className="text-sm text-muted-foreground italic leading-relaxed max-h-32 overflow-y-auto">
                "{result.text}"
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleUse}
            >
              <Check className="w-4 h-4" />
              Use This Scripture
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, Download, ArrowRight, BookOpen } from 'lucide-react';

const ExportSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const sermonId = searchParams.get('sermon_id');
  const [showExportOptions, setShowExportOptions] = useState(false);

  useEffect(() => {
    // After a short delay, show export options
    const timer = setTimeout(() => {
      setShowExportOptions(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen gradient-warm flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md text-center"
      >
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6"
        >
          <Check className="w-10 h-10 text-green-600" />
        </motion.div>

        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Payment Successful!
        </h1>
        <p className="text-muted-foreground mb-8">
          Your payment has been processed. You can now export your sermon slides.
        </p>

        {showExportOptions && sermonId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-4"
          >
            <Link to={`/editor/${sermonId}?export=true`}>
              <Button variant="hero" size="lg" className="w-full">
                <Download className="w-5 h-5" />
                Go to Export
              </Button>
            </Link>

            <p className="text-sm text-muted-foreground">
              You'll be taken back to the editor to download your files.
            </p>
          </motion.div>
        )}

        {!sermonId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="space-y-4"
          >
            <Link to="/create">
              <Button variant="hero" size="lg" className="w-full">
                <BookOpen className="w-5 h-5" />
                Create a Sermon
              </Button>
            </Link>

            <Link to="/">
              <Button variant="outline" size="lg" className="w-full">
                <ArrowRight className="w-5 h-5" />
                Back to Home
              </Button>
            </Link>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default ExportSuccess;

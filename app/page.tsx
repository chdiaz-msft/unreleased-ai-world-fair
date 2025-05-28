"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { useCompletion } from "ai/react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";

export default function Page() {
  const {
    input,
    handleInputChange,
    setInput,
    handleSubmit,
    error,
    completion,
    isLoading,
  } = useCompletion({
    api: "/generate",
    onResponse: (response) => {
      // Capture the span ID from response headers for feedback correlation
      const spanId = response.headers.get('X-Braintrust-Span-Id');
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('Captured span ID:', spanId);
      if (spanId) {
        setSpanId(spanId);
      }
    },
  });

  const [sampleRepoUrl, setSampleRepoUrl] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<string | null>(null);
  const [showCommentField, setShowCommentField] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [spanId, setSpanId] = useState<string | null>(null);
  
  useEffect(() => {
    if (!sampleRepoUrl) return;
    handleSubmit();
    setSampleRepoUrl(null);
  }, [sampleRepoUrl, handleSubmit]);

  // Reset feedback state when new completion starts
  useEffect(() => {
    if (isLoading) {
      setFeedbackSubmitted(null);
      setShowCommentField(null);
      setComment("");
      setSpanId(null);
    }
  }, [isLoading]);

  const onClickSampleRepo = (url: string) => {
    setInput(url);
    setSampleRepoUrl(url);
  };

  const onFeedbackClick = async (score: number) => {
    if (feedbackSubmitted || isLoading) return;
    
    // Immediately submit the thumbs up/down feedback
    await submitFeedback(score);
    
    // Then show comment field for optional additional feedback
    setShowCommentField(score);
  };

  const submitFeedback = async (score: number) => {
    if (!completion || isLoading) return;
    
    const feedbackData = {
      score,
      input,
      output: completion,
      comment: comment.trim() || undefined,
      spanId,
    };
    
    console.log('Submitting feedback:', feedbackData);
    
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedbackData),
      });

      console.log('Feedback response status:', response.status);
      const responseData = await response.json();
      console.log('Feedback response data:', responseData);

      if (response.ok) {
        console.log('Feedback submitted successfully');
      } else {
        console.error('Failed to submit feedback:', responseData);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const handleCommentSubmit = () => {
    if (showCommentField !== null) {
      submitFeedback(showCommentField);
      setFeedbackSubmitted(showCommentField === 1 ? 'positive' : 'negative');
      setShowCommentField(null);
      setComment("");
    }
  };

  const handleSkipComment = () => {
    if (showCommentField !== null) {
      setFeedbackSubmitted(showCommentField === 1 ? 'positive' : 'negative');
      setShowCommentField(null);
      setComment("");
    }
  };

  // Only show feedback when streaming is complete (not loading) and we have completion text
  const showFeedback = !isLoading && completion && completion.trim() !== "";

  return (
    <div className="flex flex-col gap-8 mb-8">
      <form
        className="flex flex-col sm:flex-row gap-2 relative"
        onSubmit={handleSubmit}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <GitHubLogoIcon className="size-5 text-stone-400" />
        </div>
        <Input
          type="url"
          name="url"
          value={input}
          onChange={handleInputChange}
          required
          disabled={isLoading}
          placeholder="Enter public GitHub repository URL"
          className="text-lg rounded-full px-4 pl-12 h-12 transition-all bg-stone-900"
        />
        <Button
          size="lg"
          type="submit"
          disabled={isLoading}
          className="h-12 rounded-full text-lg font-medium bg-slate-200 transition-colors"
        >
          Submit
        </Button>
      </form>
      {isLoading && completion.trim() === "" ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-[550px]" />
          <Skeleton className="h-12 w-[500px]" />
          <Skeleton className="h-12 w-[520px]" />
          <Skeleton className="h-12 w-[480px]" />
        </div>
      ) : error ? (
        <div className="bg-rose-950 px-4 rounded-md py-2 text-base text-rose-200">
          {error.message}
        </div>
      ) : completion ? (
        <div className="space-y-4">
          <div className="text-base prose prose-stone prose-sm prose-invert">
            <Markdown>{completion}</Markdown>
          </div>
          
          {/* Show streaming indicator while loading */}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-stone-400">
              <div className="animate-pulse">●</div>
              <span>Generating changelog...</span>
            </div>
          )}
          
          {/* Feedback Section - Only show when streaming is complete */}
          {showFeedback && !feedbackSubmitted && (
            <div className="space-y-4 pt-4 border-t border-stone-800">
              <div className="flex items-center gap-4">
                <span className="text-sm text-stone-400">Was this helpful?</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onFeedbackClick(1)}
                    disabled={!!feedbackSubmitted}
                    className={`transition-colors ${
                      showCommentField === 1 
                        ? 'bg-green-900 border-green-700 text-green-200' 
                        : 'hover:bg-stone-800'
                    }`}
                  >
                    👍
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onFeedbackClick(0)}
                    disabled={!!feedbackSubmitted}
                    className={`transition-colors ${
                      showCommentField === 0 
                        ? 'bg-red-900 border-red-700 text-red-200' 
                        : 'hover:bg-stone-800'
                    }`}
                  >
                    👎
                  </Button>
                </div>
              </div>
              
              {/* Comment field appears after clicking feedback */}
              {showCommentField !== null && !feedbackSubmitted && (
                <div className="space-y-3 pl-4 border-l-2 border-stone-700">
                  <div className="text-sm text-stone-400">
                    {showCommentField === 1 
                      ? "What did you find helpful? (optional)" 
                      : "What could be improved? (optional)"
                    }
                  </div>
                  <Textarea
                    value={comment}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
                    placeholder={showCommentField === 1 
                      ? "The changelog was clear and well-organized..." 
                      : "Missing important details, unclear formatting..."
                    }
                    className="bg-stone-900 border-stone-700 text-stone-200 placeholder:text-stone-500"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCommentSubmit}
                      className="bg-stone-700 hover:bg-stone-600 text-stone-200"
                      disabled={!comment.trim()}
                    >
                      Submit with Comment
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSkipComment}
                      className="text-stone-400 hover:bg-stone-800"
                    >
                      Submit without Comment
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Thank you message after submission */}
          {feedbackSubmitted && (
            <div className="pt-4 border-t border-stone-800">
              <span className="text-sm text-stone-500">
                Thank you for your feedback!
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <SampleRepo slug="microsoft/typescript" onClick={onClickSampleRepo} />
          <SampleRepo slug="facebook/react" onClick={onClickSampleRepo} />
          <SampleRepo slug="vercel/next.js" onClick={onClickSampleRepo} />
        </div>
      )}
    </div>
  );
}

const SampleRepo = ({
  slug,
  onClick,
}: {
  slug: string;
  onClick: (url: string) => void;
}) => (
  <Button
    variant="outline"
    className="text-stone-300 gap-2"
    onClick={() => onClick(`https://github.com/${slug}`)}
  >
    {slug}
    <span className="text-stone-500">{"->"}</span>
  </Button>
);

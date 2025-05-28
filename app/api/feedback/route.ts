import { NextRequest, NextResponse } from "next/server";
import { currentLogger } from "@/lib/braintrust";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Feedback request body:', JSON.stringify(body, null, 2));
    
    const { score, input, output, comment, spanId } = body;

    // Validate the request
    if (typeof score !== 'number' || (score !== 0 && score !== 1)) {
      console.log('Invalid score:', score, typeof score);
      return NextResponse.json(
        { error: 'Score must be 0 or 1' },
        { status: 400 }
      );
    }

    if (!input || !output) {
      console.log('Missing input or output:', { input: !!input, output: !!output });
      return NextResponse.json(
        { error: 'Input and output are required' },
        { status: 400 }
      );
    }

    if (!spanId) {
      console.log('Missing spanId:', spanId);
      return NextResponse.json(
        { error: 'Span ID is required for feedback correlation' },
        { status: 400 }
      );
    }

    // Log feedback to console for debugging
    const feedbackType = score === 1 ? 'positive' : 'negative';
    console.log(`User feedback received: ${feedbackType} for ${input}`);
    
    if (comment && comment.trim()) {
      console.log(`Comment: ${comment.trim()}`);
    }

    console.log(`Associated with span: ${spanId}`);

    // Use Braintrust logger to log feedback with the span ID
    const logger = currentLogger();
    
    if (!logger) {
      console.error('Braintrust logger not initialized');
      return NextResponse.json(
        { error: 'Logging not initialized' }, 
        { status: 500 }
      );
    }

    console.log('About to call logger.logFeedback...');

    // Log feedback using the logger.logFeedback method
    // This associates the feedback with the original generation span
    await logger.logFeedback({
      id: spanId,
      scores: {
        user_feedback: score,
      },
      comment: comment?.trim() || undefined,
      metadata: {
        input_url: input,
        feedback_type: feedbackType,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`Feedback logged to Braintrust for span ${spanId}`);

    // Generate a simple feedback ID for response consistency
    const feedbackId = `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return NextResponse.json({ success: true, feedbackId, category: feedbackType });
  } catch (error) {
    console.error('Error processing feedback:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to process feedback' },
      { status: 500 }
    );
  }
}
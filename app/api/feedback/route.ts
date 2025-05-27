import { initLogger, currentLogger } from "braintrust";
import { NextRequest, NextResponse } from "next/server";
import { PROJECT_NAME } from "@/lib/constants";

// Initialize logger for feedback logging
const logger = initLogger({
  projectName: PROJECT_NAME,
  apiKey: process.env.BRAINTRUST_API_KEY,
  asyncFlush: true,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { score, input, output } = body;

    // Validate the request
    if (typeof score !== 'number' || (score !== 0 && score !== 1)) {
      return NextResponse.json(
        { error: 'Score must be 0 or 1' },
        { status: 400 }
      );
    }

    if (!input || !output) {
      return NextResponse.json(
        { error: 'Input and output are required' },
        { status: 400 }
      );
    }

    // Create a feedback event in Braintrust
    // Since we don't have the original span ID, we'll create a new event
    // that represents the user feedback
    const feedbackId = await logger.log({
      input: { 
        repository_url: input,
        feedback_request: "User feedback on changelog generation"
      },
      output: {
        user_feedback: score === 1 ? 'helpful' : 'not_helpful',
        generated_changelog: output
      },
      scores: {
        user_feedback: score,
      },
      metadata: {
        event_type: 'user_feedback',
        feedback_type: 'thumbs_up_down',
        timestamp: new Date().toISOString(),
        user_action: score === 1 ? 'thumbs_up' : 'thumbs_down',
      },
    });

    console.log(`Logged user feedback with ID: ${feedbackId}`);

    return NextResponse.json({ success: true, feedbackId });
  } catch (error) {
    console.error('Error logging feedback:', error);
    return NextResponse.json(
      { error: 'Failed to log feedback' },
      { status: 500 }
    );
  }
} 
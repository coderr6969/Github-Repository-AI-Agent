import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export class MockChatModel extends BaseChatModel {
  _llmType(): string {
    return 'mock';
  }

  async _generate(messages: BaseMessage[]): Promise<any> {
    const lastMsg = messages[messages.length - 1];
    const text = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);

    logger.debug({ text: text.substring(0, 100) }, 'MockChatModel generating response');

    // Simulate intelligent answers based on question keywords
    if (text.includes('JWT') || text.includes('authentication') || text.includes('login')) {
      return {
        generations: [
          {
            text: `JWT authentication is primarily implemented in:

- **src/auth/jwt.ts:12-38**: Creates and verifies JWT tokens using the configured secret key.
- **src/middleware/auth.ts:8-42**: Extracts the Bearer token from the Authorization header and validates user claims.

### Authentication Flow:
1. Client requests login endpoint.
2. Server validates credentials and generates JWT via \`generateToken()\` in \`src/auth/jwt.ts\`.
3. Client includes Bearer token in \`Authorization\` header for subsequent requests.
4. \`authMiddleware\` in \`src/middleware/auth.ts\` intercepts requests, calls \`verifyToken()\`, and attaches user identity to the request context.`,
            message: new AIMessage({
              content: `JWT authentication is primarily implemented in:

- **src/auth/jwt.ts:12-38**: Creates and verifies JWT tokens using the configured secret key.
- **src/middleware/auth.ts:8-42**: Extracts the Bearer token from the Authorization header and validates user claims.

### Authentication Flow:
1. Client requests login endpoint.
2. Server validates credentials and generates JWT via \`generateToken()\` in \`src/auth/jwt.ts\`.
3. Client includes Bearer token in \`Authorization\` header for subsequent requests.
4. \`authMiddleware\` in \`src/middleware/auth.ts\` intercepts requests, calls \`verifyToken()\`, and attaches user identity to the request context.`,
            }),
          },
        ],
      };
    }

    if (text.includes('pull request') || text.includes('PR') || text.includes('#42')) {
      return {
        generations: [
          {
            text: `### Pull Request Summary: #42
- **Title**: Add JWT token refresh endpoint
- **Author**: octocat
- **State**: open
- **Changes**: +120 / -15 lines across 3 files
- **Key modified file**: \`src/auth/jwt.ts:10-30\`
- **Description**: Implements refresh token support with rotation in the auth module.`,
            message: new AIMessage({
              content: `### Pull Request Summary: #42
- **Title**: Add JWT token refresh endpoint
- **Author**: octocat
- **State**: open
- **Changes**: +120 / -15 lines across 3 files
- **Key modified file**: \`src/auth/jwt.ts:10-30\`
- **Description**: Implements refresh token support with rotation in the auth module.`,
            }),
          },
        ],
      };
    }

    if (text.includes('create an issue') || text.includes('create issue') || text.includes('Create GitHub issue')) {
      return {
        generations: [
          {
            text: `I have identified a potential security issue in JWT token verification.

Before creating the issue on GitHub, please confirm if you would like me to proceed with these details:

- **Title**: Bug: Missing token expiration check in custom auth handler
- **Body**: In \`src/auth/jwt.ts:25\`, token expiry should be enforced strictly during verification.

Would you like me to create this issue on GitHub? Please reply "yes" to confirm.`,
            message: new AIMessage({
              content: `I have identified a potential security issue in JWT token verification.

Before creating the issue on GitHub, please confirm if you would like me to proceed with these details:

- **Title**: Bug: Missing token expiration check in custom auth handler
- **Body**: In \`src/auth/jwt.ts:25\`, token expiry should be enforced strictly during verification.

Would you like me to create this issue on GitHub? Please reply "yes" to confirm.`,
            }),
          },
        ],
      };
    }

    // Default response
    return {
      generations: [
        {
          text: `Based on the repository source code analysis:
The repository contains the requested structure and modules.
Referenced files:
- \`src/auth/jwt.ts:1-30\`
- \`package.json:1-25\``,
          message: new AIMessage({
            content: `Based on the repository source code analysis:
The repository contains the requested structure and modules.
Referenced files:
- \`src/auth/jwt.ts:1-30\`
- \`package.json:1-25\``,
          }),
        },
      ],
    };
  }
}

export function createLLM(): BaseChatModel {
  if (env.LLM_PROVIDER === 'mock' || (!env.LLM_API_KEY && env.NODE_ENV === 'test')) {
    logger.info('Using MockChatModel for agent execution');
    return new MockChatModel({});
  }

  logger.info({ provider: env.LLM_PROVIDER, model: env.LLM_MODEL }, 'Creating LLM instance');
  return new ChatOpenAI({
    openAIApiKey: env.LLM_API_KEY || 'mock-key',
    modelName: env.LLM_MODEL,
    temperature: env.LLM_TEMPERATURE,
    configuration: {
      baseURL: env.LLM_BASE_URL || undefined,
    },
  });
}

/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from specification/ catalogs via scripts/generate-catalog-schemas.mjs
import {z} from 'zod';

import {ComponentApi} from '@a2ui/web_core_v1_0';
import {
  ActionSchema,
  CheckRuleSchema,
  ChildListSchema,
  ChildSchema,
  DataBindingSchema,
  DynamicBooleanSchema,
  DynamicNumberSchema,
  DynamicStringListSchema,
  DynamicStringSchema,
} from '@a2ui/schema-zod-v4';

export const TextApi = {
  name: 'Text',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        text: {type: 'DYNAMIC'},
        variant: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {text: 'DYNAMIC'},
    propertyKeys: ['text', 'variant', 'weight'],
  },
  schema: z
    .object({
      'text': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The text content to display. While simple Markdown formatting is supported (i.e. without HTML, images, or links), utilizing dedicated UI components is generally preferred for a richer and more structured presentation.',
      ),
      'variant': z
        .enum(['caption', 'body'])
        .default('body')
        .describe('A hint for the base text style.')
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const ImageApi = {
  name: 'Image',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        url: {type: 'DYNAMIC'},
        description: {type: 'DYNAMIC'},
        fit: {type: 'STATIC'},
        variant: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {url: 'DYNAMIC', description: 'DYNAMIC'},
    propertyKeys: ['url', 'description', 'fit', 'variant', 'weight'],
  },
  schema: z
    .object({
      'url': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The URL of the image to display.',
      ),
      'description': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|Accessibility text for the image.',
      ).optional(),
      'fit': z
        .enum(['contain', 'cover', 'fill', 'none', 'scaleDown'])
        .default('fill')
        .describe(
          "Specifies how the image should be resized to fit its container. This corresponds to the CSS 'object-fit' property.",
        )
        .optional(),
      'variant': z
        .enum(['icon', 'avatar', 'smallFeature', 'mediumFeature', 'largeFeature', 'header'])
        .default('mediumFeature')
        .describe('A hint for the image size and style.')
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const IconApi = {
  name: 'Icon',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        name: {type: 'DYNAMIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {name: 'DYNAMIC'},
    propertyKeys: ['name', 'weight'],
  },
  schema: z
    .object({
      'name': z
        .union([
          z.enum([
            'accountCircle',
            'add',
            'arrowBack',
            'arrowForward',
            'attachFile',
            'calendarToday',
            'call',
            'camera',
            'check',
            'close',
            'delete',
            'download',
            'edit',
            'event',
            'error',
            'fastForward',
            'favorite',
            'favoriteOff',
            'folder',
            'help',
            'home',
            'info',
            'locationOn',
            'lock',
            'lockOpen',
            'mail',
            'menu',
            'moreVert',
            'moreHoriz',
            'notificationsOff',
            'notifications',
            'pause',
            'payment',
            'person',
            'phone',
            'photo',
            'play',
            'print',
            'refresh',
            'rewind',
            'search',
            'send',
            'settings',
            'share',
            'shoppingCart',
            'skipNext',
            'skipPrevious',
            'star',
            'starHalf',
            'starOff',
            'stop',
            'upload',
            'visibility',
            'visibilityOff',
            'volumeDown',
            'volumeMute',
            'volumeOff',
            'volumeUp',
            'warning',
          ]),
          z.object({
            'svgPath': DynamicStringSchema.describe('REF:#/$defs/DynamicString'),
          }),
          DataBindingSchema.describe('REF:#/$defs/DataBinding'),
        ])
        .describe('The name of the icon to display.'),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const VideoApi = {
  name: 'Video',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        url: {type: 'DYNAMIC'},
        posterUrl: {type: 'DYNAMIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {url: 'DYNAMIC', posterUrl: 'DYNAMIC'},
    propertyKeys: ['url', 'posterUrl', 'weight'],
  },
  schema: z
    .object({
      'url': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The URL of the video to display.',
      ),
      'posterUrl': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The URL of the poster image to display before the video plays.',
      ).optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const AudioPlayerApi = {
  name: 'AudioPlayer',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        url: {type: 'DYNAMIC'},
        description: {type: 'DYNAMIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {url: 'DYNAMIC', description: 'DYNAMIC'},
    propertyKeys: ['url', 'description', 'weight'],
  },
  schema: z
    .object({
      'url': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The URL of the audio to be played.',
      ),
      'description': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|A description of the audio, such as a title or summary.',
      ).optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const RowApi = {
  name: 'Row',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        children: {type: 'STRUCTURAL'},
        justify: {type: 'STATIC'},
        align: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    childLists: ['children'],
    dynamicFields: {children: 'STRUCTURAL'},
    propertyKeys: ['children', 'justify', 'align', 'weight'],
  },
  schema: z
    .object({
      'children': ChildListSchema.describe(
        'REF:#/$defs/ChildList|Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.',
      ),
      'justify': z
        .enum(['center', 'end', 'spaceAround', 'spaceBetween', 'spaceEvenly', 'start', 'stretch'])
        .default('start')
        .describe(
          "Defines the arrangement of children along the main axis (horizontally). Use 'spaceBetween' to push items to the edges, or 'start'/'end'/'center' to pack them together.",
        )
        .optional(),
      'align': z
        .enum(['start', 'center', 'end', 'stretch'])
        .default('stretch')
        .describe(
          "Defines the alignment of children along the cross axis (vertically). This is similar to the CSS 'align-items' property, but uses camelCase values (e.g., 'start').",
        )
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const ColumnApi = {
  name: 'Column',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        children: {type: 'STRUCTURAL'},
        justify: {type: 'STATIC'},
        align: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    childLists: ['children'],
    dynamicFields: {children: 'STRUCTURAL'},
    propertyKeys: ['children', 'justify', 'align', 'weight'],
  },
  schema: z
    .object({
      'children': ChildListSchema.describe(
        'REF:#/$defs/ChildList|Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.',
      ),
      'justify': z
        .enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch'])
        .default('start')
        .describe(
          "Defines the arrangement of children along the main axis (vertically). Use 'spaceBetween' to push items to the edges (e.g. header at top, footer at bottom), or 'start'/'end'/'center' to pack them together.",
        )
        .optional(),
      'align': z
        .enum(['center', 'end', 'start', 'stretch'])
        .default('stretch')
        .describe(
          "Defines the alignment of children along the cross axis (horizontally). This is similar to the CSS 'align-items' property.",
        )
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const ListApi = {
  name: 'List',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        children: {type: 'STRUCTURAL'},
        direction: {type: 'STATIC'},
        align: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    childLists: ['children'],
    dynamicFields: {children: 'STRUCTURAL'},
    propertyKeys: ['children', 'direction', 'align', 'weight'],
  },
  schema: z
    .object({
      'children': ChildListSchema.describe(
        'REF:#/$defs/ChildList|Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list.',
      ),
      'direction': z
        .enum(['vertical', 'horizontal'])
        .default('vertical')
        .describe('The direction in which the list items are laid out.')
        .optional(),
      'align': z
        .enum(['start', 'center', 'end', 'stretch'])
        .default('stretch')
        .describe('Defines the alignment of children along the cross axis.')
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const CardApi = {
  name: 'Card',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        child: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    childRefs: ['child'],
    propertyKeys: ['child', 'weight'],
  },
  schema: z
    .object({
      'child': ChildSchema.describe(
        "REF:#/$defs/Child|The ID of the single child component to be rendered inside the card. To display multiple elements, you MUST wrap them in a layout component (like Column or Row) and pass that container's ID here. Do NOT pass multiple IDs or a non-existent ID.",
      ),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const TabsApi = {
  name: 'Tabs',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        tabs: {
          type: 'ARRAY',
          element: {type: 'OBJECT', shape: {title: {type: 'DYNAMIC'}, child: {type: 'STATIC'}}},
        },
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    childLists: ['tabs'],
    nestedChildRefs: {tabs: ['child']},
    propertyKeys: ['tabs', 'weight'],
  },
  schema: z
    .object({
      'tabs': z
        .array(
          z.object({
            'title': DynamicStringSchema.describe('REF:#/$defs/DynamicString|The tab title.'),
            'child': ChildSchema.describe('REF:#/$defs/Child|The ID of the child component.'),
          }),
        )
        .min(1)
        .describe(
          'An array of objects, where each object defines a tab with a title and a child component.',
        ),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const ModalApi = {
  name: 'Modal',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        trigger: {type: 'STATIC'},
        content: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    childRefs: ['trigger', 'content'],
    propertyKeys: ['trigger', 'content', 'weight'],
  },
  schema: z
    .object({
      'trigger': ChildSchema.describe(
        'REF:#/$defs/Child|The ID of the component that opens the modal when interacted with (e.g., a button).',
      ),
      'content': ChildSchema.describe(
        'REF:#/$defs/Child|The ID of the component to be displayed inside the modal.',
      ),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const DividerApi = {
  name: 'Divider',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        component: {type: 'STATIC'},
        axis: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    propertyKeys: ['axis', 'weight'],
  },
  schema: z
    .object({
      'axis': z
        .enum(['horizontal', 'vertical'])
        .default('horizontal')
        .describe('The orientation of the divider.')
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const ButtonApi = {
  name: 'Button',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        checks: {type: 'CHECKABLE'},
        component: {type: 'STATIC'},
        child: {type: 'STATIC'},
        variant: {type: 'STATIC'},
        action: {type: 'ACTION'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    childRefs: ['child'],
    dynamicFields: {checks: 'CHECKABLE', action: 'ACTION'},
    propertyKeys: ['checks', 'child', 'variant', 'action', 'weight'],
  },
  schema: z
    .object({
      'checks': z
        .array(CheckRuleSchema.describe('REF:#/$defs/CheckRule'))
        .describe('A list of validation check rules to perform on the component.')
        .optional(),
      'child': ChildSchema.describe(
        "REF:#/$defs/Child|The ID of the child component. Use a 'Text' component for a labeled button. Only use an 'Icon' if the requirements explicitly ask for an icon-only button.",
      ),
      'variant': z
        .enum(['default', 'primary', 'borderless'])
        .default('default')
        .describe(
          "A hint for the button style. If omitted, a default button style is used. 'primary' indicates this is the main call-to-action button. 'borderless' means the button has no visual border or background, making its child content appear like a clickable link.",
        )
        .optional(),
      'action': ActionSchema.describe('REF:#/$defs/Action'),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const TextFieldApi = {
  name: 'TextField',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        checks: {type: 'CHECKABLE'},
        component: {type: 'STATIC'},
        label: {type: 'DYNAMIC'},
        value: {type: 'DYNAMIC'},
        placeholder: {type: 'DYNAMIC'},
        variant: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {
      checks: 'CHECKABLE',
      label: 'DYNAMIC',
      value: 'DYNAMIC',
      placeholder: 'DYNAMIC',
    },
    propertyKeys: ['checks', 'label', 'value', 'placeholder', 'variant', 'weight'],
  },
  schema: z
    .object({
      'checks': z
        .array(CheckRuleSchema.describe('REF:#/$defs/CheckRule'))
        .describe('A list of validation check rules to perform on the component.')
        .optional(),
      'label': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The text label for the input field.',
      ),
      'value': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The value of the text field.',
      ).optional(),
      'placeholder': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The placeholder text for the input field.',
      ).optional(),
      'variant': z
        .enum(['longText', 'number', 'shortText', 'obscured'])
        .default('shortText')
        .describe('The type of input field to display.')
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const CheckBoxApi = {
  name: 'CheckBox',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        checks: {type: 'CHECKABLE'},
        component: {type: 'STATIC'},
        label: {type: 'DYNAMIC'},
        value: {type: 'DYNAMIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {checks: 'CHECKABLE', label: 'DYNAMIC', value: 'DYNAMIC'},
    propertyKeys: ['checks', 'label', 'value', 'weight'],
  },
  schema: z
    .object({
      'checks': z
        .array(CheckRuleSchema.describe('REF:#/$defs/CheckRule'))
        .describe('A list of validation check rules to perform on the component.')
        .optional(),
      'label': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The text to display next to the checkbox.',
      ),
      'value': DynamicBooleanSchema.describe(
        'REF:#/$defs/DynamicBoolean|The current state of the checkbox (true for checked, false for unchecked).',
      ),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const ChoicePickerApi = {
  name: 'ChoicePicker',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        checks: {type: 'CHECKABLE'},
        component: {type: 'STATIC'},
        label: {type: 'DYNAMIC'},
        variant: {type: 'STATIC'},
        options: {
          type: 'ARRAY',
          element: {type: 'OBJECT', shape: {label: {type: 'DYNAMIC'}, value: {type: 'STATIC'}}},
        },
        value: {type: 'DYNAMIC'},
        displayStyle: {type: 'STATIC'},
        filterable: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {checks: 'CHECKABLE', label: 'DYNAMIC', value: 'DYNAMIC'},
    propertyKeys: [
      'checks',
      'label',
      'variant',
      'options',
      'value',
      'displayStyle',
      'filterable',
      'weight',
    ],
  },
  schema: z
    .object({
      'checks': z
        .array(CheckRuleSchema.describe('REF:#/$defs/CheckRule'))
        .describe('A list of validation check rules to perform on the component.')
        .optional(),
      'label': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The label for the group of options.',
      ).optional(),
      'variant': z
        .enum(['multipleSelection', 'mutuallyExclusive'])
        .default('mutuallyExclusive')
        .describe('A hint for how the choice picker should be displayed and behave.')
        .optional(),
      'options': z
        .array(
          z.object({
            'label': DynamicStringSchema.describe(
              'REF:#/$defs/DynamicString|The text to display for this option.',
            ),
            'value': z.string().describe('The stable value associated with this option.'),
          }),
        )
        .describe('The list of available options to choose from.'),
      'value': DynamicStringListSchema.describe(
        'REF:#/$defs/DynamicStringList|The list of currently selected values. This should be bound to a string array in the data model.',
      ),
      'displayStyle': z
        .enum(['checkbox', 'chips'])
        .default('checkbox')
        .describe('The display style of the component.')
        .optional(),
      'filterable': z
        .boolean()
        .default(false)
        .describe('If true, displays a search input to filter the options.')
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const SliderApi = {
  name: 'Slider',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        checks: {type: 'CHECKABLE'},
        component: {type: 'STATIC'},
        label: {type: 'DYNAMIC'},
        min: {type: 'STATIC'},
        max: {type: 'STATIC'},
        value: {type: 'DYNAMIC'},
        steps: {type: 'STATIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {checks: 'CHECKABLE', label: 'DYNAMIC', value: 'DYNAMIC'},
    propertyKeys: ['checks', 'label', 'min', 'max', 'value', 'steps', 'weight'],
  },
  schema: z
    .object({
      'checks': z
        .array(CheckRuleSchema.describe('REF:#/$defs/CheckRule'))
        .describe('A list of validation check rules to perform on the component.')
        .optional(),
      'label': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The label for the slider.',
      ).optional(),
      'min': z.number().default(0).describe('The minimum value of the slider.').optional(),
      'max': z.number().describe('The maximum value of the slider.'),
      'value': DynamicNumberSchema.describe(
        'REF:#/$defs/DynamicNumber|The current value of the slider.',
      ),
      'steps': z
        .number()
        .int()
        .describe(
          'The number of discrete divisions in the slider range. If specified, the slider will snap to discrete values.',
        )
        .optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const DateTimeInputApi = {
  name: 'DateTimeInput',
  schemaMetadata: {
    behavior: {
      type: 'OBJECT',
      shape: {
        checks: {type: 'CHECKABLE'},
        component: {type: 'STATIC'},
        value: {type: 'DYNAMIC'},
        enableDate: {type: 'STATIC'},
        enableTime: {type: 'STATIC'},
        min: {type: 'DYNAMIC'},
        max: {type: 'DYNAMIC'},
        label: {type: 'DYNAMIC'},
        weight: {type: 'STATIC'},
        accessibility: {
          type: 'OBJECT',
          shape: {
            label: {type: 'DYNAMIC'},
            description: {type: 'DYNAMIC'},
            live: {type: 'STATIC'},
            hidden: {type: 'DYNAMIC'},
          },
        },
      },
    },
    dynamicFields: {
      checks: 'CHECKABLE',
      value: 'DYNAMIC',
      min: 'DYNAMIC',
      max: 'DYNAMIC',
      label: 'DYNAMIC',
    },
    propertyKeys: ['checks', 'value', 'enableDate', 'enableTime', 'min', 'max', 'label', 'weight'],
  },
  schema: z
    .object({
      'checks': z
        .array(CheckRuleSchema.describe('REF:#/$defs/CheckRule'))
        .describe('A list of validation check rules to perform on the component.')
        .optional(),
      'value': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The selected date and/or time value in ISO 8601 format. If not yet set, initialize with an empty string.',
      ),
      'enableDate': z
        .boolean()
        .default(false)
        .describe('If true, allows the user to select a date.')
        .optional(),
      'enableTime': z
        .boolean()
        .default(false)
        .describe('If true, allows the user to select a time.')
        .optional(),
      'min': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The minimum allowed date/time in ISO 8601 format.',
      ).optional(),
      'max': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The maximum allowed date/time in ISO 8601 format.',
      ).optional(),
      'label': DynamicStringSchema.describe(
        'REF:#/$defs/DynamicString|The text label for the input field.',
      ).optional(),
      'weight': z
        .number()
        .describe(
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
        )
        .optional(),
    })
    .strict(),
} satisfies ComponentApi;

export const BASIC_COMPONENTS: ComponentApi[] = [
  TextApi,
  ImageApi,
  IconApi,
  VideoApi,
  AudioPlayerApi,
  RowApi,
  ColumnApi,
  ListApi,
  CardApi,
  TabsApi,
  ModalApi,
  DividerApi,
  ButtonApi,
  TextFieldApi,
  CheckBoxApi,
  ChoicePickerApi,
  SliderApi,
  DateTimeInputApi,
];
